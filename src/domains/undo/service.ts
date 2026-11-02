import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { mfaSatisfied } from "../../lib/security-policy";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { revertDecision, type DecisionUndo } from "../registrations/undo";
import { isAdmin, permissions, type Permission } from "../access/policy";

/**
 * Undo after an important action (wave 15, C10). The module that does a
 * reversible action records what it changed (`offerUndo`, same transaction);
 * its author then has two minutes to put it back. The undo runs on the
 * server, with the rights of the action checked again, once, and leaves a
 * line in the audit log. Definitive deletions and sent emails offer none.
 */
export const undoKinds = ["teamArchive", "seasonArchive", "endAssignment", "move", "chairRetire", "payment", "eventCancel", "registrationDecision", "affiliationPaid", "operationDelete", "attendanceMark"] as const;
export type UndoKind = (typeof undoKinds)[number];
/** Server window; the message on screen lasts 8 seconds (longer while hovered). */
export const undoSeconds = 120;

type Payloads = {
  teamArchive: { archived: boolean };
  seasonArchive: { archived: boolean };
  endAssignment: { ends_on: string | null; closed_at: string | null };
  move: { created: string; previous: { id: string; ends_on: string | null; closed_at: string | null; cancelled: boolean } | null };
  chairRetire: { status: string; links: string[] };
  payment: { receivable: string | null; plan: string | null };
  /** Wave 16 (E1): the events a cancellation touched. */
  eventCancel: { ids: string[] };
  /** Wave 17 (F1): everything a decision on an application changed. */
  registrationDecision: DecisionUndo;
  /** Wave 17 (N2): an affiliation marked « en ordre », and the expense it created. */
  affiliationPaid: { transaction: string | null };
  /** Wave 17 (N1): a deleted operation, and whether it was already cancelled before. */
  operationDelete: { wasCancelled: boolean };
  /** Wave 17 (J2): the marks of a roll call as they were before the click (or « Tout présent »). */
  attendanceMark: { marks: { id: string; actual: string }[] };
};

export async function offerUndo<K extends UndoKind>(c: PoolClient, org: string, userId: string, kind: K, target: string, payload: Payloads[K]) {
  return (
    await c.query(
      `INSERT INTO undo_action(organization_id,user_id,kind,target_id,payload,expires_at) VALUES($1,$2,$3,$4,$5,now()+make_interval(secs => $6)) RETURNING id`,
      [org, userId, kind, target, JSON.stringify(payload), undoSeconds],
    )
  ).rows[0].id as string;
}

export const undoCommand = z.object({ id: z.uuid() });

/** What each kind needs, as for the action itself. */
function allowed(kind: UndoKind, role: Parameters<typeof permissions>[0], grants: string[], mfa: boolean) {
  const rights = permissions(role, grants);
  const has = (r: Permission) => mfa && rights.includes(r);
  switch (kind) {
    case "teamArchive":
    case "seasonArchive":
    case "endAssignment":
    case "move":
      return has("teams.manage");
    case "chairRetire":
      return has("equipment.manage");
    case "payment":
      return has("dues.manage");
    case "eventCancel":
      // The coach who cancelled a team event may put it back too.
      return has("calendar.manage") || (mfa && role === "coach");
    case "registrationDecision":
      return has("registrations.manage");
    case "affiliationPaid":
    case "operationDelete":
      return has("dues.manage");
    case "attendanceMark":
      // Whoever takes the roll call: the coach included.
      return mfa && (isAdmin(role) || role === "coach" || rights.includes("attendance.manage"));
  }
}

export async function undoExecute(db: Pool, p: Principal, input: z.infer<typeof undoCommand>, expected: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    if (a.organization_id !== expected) throw new AccessError("CONTEXT_CHANGED", 409);
    await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [a.organization_id]);
    const user = await account(c, p);
    const row = (
      await c.query("SELECT id,kind,target_id,payload,expires_at<now() AS expired,used_at FROM undo_action WHERE id=$1 AND organization_id=$2 AND user_id=$3 FOR UPDATE", [
        input.id,
        a.organization_id,
        p.userId,
      ])
    ).rows[0] as { id: string; kind: UndoKind; target_id: string; payload: Record<string, unknown>; expired: boolean; used_at: string | null } | undefined;
    if (!row) throw new AccessError("NOT_FOUND", 404);
    if (row.used_at) throw new AccessError("UNDO_USED", 409);
    if (row.expired) throw new AccessError("UNDO_EXPIRED", 410);
    if (!allowed(row.kind, a.role, a.grants, mfaSatisfied(!!user.twoFactorEnabled))) throw new AccessError("FORBIDDEN");
    // A module switched off since: nothing comes back through it.
    const owner = ({ payment: "dues", chairRetire: "equipment", affiliationPaid: "finance", operationDelete: "finance" } as Record<string, string>)[row.kind];
    if (owner && (a.disabled_modules ?? []).includes(owner)) throw new AccessError("MODULE_OFF");
    await revert(c, a.organization_id, p.userId, row.kind, row.target_id, row.payload as never);
    await c.query("UPDATE undo_action SET used_at=now() WHERE id=$1", [row.id]);
    await audit(c, a.organization_id, p.userId, "undo." + row.kind, row.target_id);
    await c.query("COMMIT");
    return { ok: true as const, kind: row.kind };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

async function revert<K extends UndoKind>(c: PoolClient, org: string, userId: string, kind: K, target: string, payload: Payloads[K]) {
  const one = async (sql: string, values: unknown[]) => {
    if (!(await c.query(sql, values)).rowCount) throw new AccessError("NOT_FOUND", 404);
  };
  switch (kind) {
    case "attendanceMark": {
      const p = payload as Payloads["attendanceMark"];
      for (const m of p.marks) {
        const row = (
          await c.query(
            "UPDATE attendance_invitation SET actual=$4,marked_at=now(),marked_by=$3,version=version+1 WHERE id=$1 AND organization_id=$2 AND register_id=$5 AND withdrawn_at IS NULL RETURNING id",
            [m.id, org, userId, m.actual, target],
          )
        ).rows[0];
        if (!row) throw new AccessError("NOT_FOUND", 404);
      }
      await c.query("INSERT INTO attendance_history(register_id,actor_id,action,before_data,after_data,reason) VALUES($1,$2,'undo',NULL,$3,'')", [
        target,
        userId,
        JSON.stringify({ marks: p.marks }),
      ]);
      return;
    }
    case "registrationDecision":
      await revertDecision(c, org, userId, target, payload as Payloads["registrationDecision"]);
      return;
    case "operationDelete": {
      const p = payload as Payloads["operationDelete"];
      await one(
        `UPDATE finance_transaction SET deleted_at=NULL,deleted_by=NULL,delete_reason=''${p.wasCancelled ? "" : ",cancelled_at=NULL,cancelled_by=NULL,cancel_reason=''"} WHERE id=$1 AND organization_id=$2 AND deleted_at IS NOT NULL`,
        [target, org],
      );
      return;
    }
    case "affiliationPaid": {
      const p = payload as Payloads["affiliationPaid"];
      await one("UPDATE affiliation_due SET paid_on=NULL,marked_by=NULL,transaction_id=NULL WHERE id=$1 AND organization_id=$2 AND paid_on IS NOT NULL", [target, org]);
      if (p.transaction)
        await c.query(
          "UPDATE finance_transaction SET cancelled_at=now(),cancelled_by=$3,cancel_reason='Annulé juste après le marquage en ordre' WHERE id=$1 AND organization_id=$2 AND cancelled_at IS NULL",
          [p.transaction, org, userId],
        );
      return;
    }
    case "teamArchive":
    case "seasonArchive": {
      const p = payload as Payloads["teamArchive"];
      await one(`UPDATE ${kind === "teamArchive" ? "team" : "season"} SET archived=$3 WHERE id=$1 AND organization_id=$2`, [target, org, p.archived]);
      return;
    }
    case "endAssignment": {
      const p = payload as Payloads["endAssignment"];
      await one("UPDATE team_membership SET ends_on=$3,closed_at=$4 WHERE id=$1 AND organization_id=$2", [target, org, p.ends_on, p.closed_at]);
      return;
    }
    case "move": {
      const p = payload as Payloads["move"];
      // The new assignment is withdrawn (kept as cancelled for the history), the former one reopened as it was.
      await one("UPDATE team_membership SET cancelled=true,closed_at=now() WHERE id=$1 AND organization_id=$2 AND NOT cancelled", [p.created, org]);
      if (p.previous)
        await one("UPDATE team_membership SET ends_on=$3,closed_at=$4,cancelled=$5 WHERE id=$1 AND organization_id=$2", [p.previous.id, org, p.previous.ends_on, p.previous.closed_at, p.previous.cancelled]);
      return;
    }
    case "chairRetire": {
      const p = payload as Payloads["chairRetire"];
      const before = (await c.query("SELECT status,version FROM equipment_chair WHERE id=$1 AND organization_id=$2 FOR UPDATE", [target, org])).rows[0];
      if (!before) throw new AccessError("NOT_FOUND", 404);
      await c.query("UPDATE equipment_chair SET status=$3,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [target, org, p.status]);
      if (p.links.length) await c.query("UPDATE equipment_chair_assignment SET ends_on=NULL WHERE id=ANY($1::uuid[]) AND chair_id=$2", [p.links, target]);
      await c.query("INSERT INTO equipment_history(organization_id,chair_id,actor_id,action,before_data,after_data) VALUES($1,$2,$3,'undo',$4,$5)", [
        org,
        target,
        userId,
        JSON.stringify({ status: before.status }),
        JSON.stringify({ status: p.status }),
      ]);
      return;
    }
    case "eventCancel": {
      const p = payload as Payloads["eventCancel"];
      const back = await c.query(
        "UPDATE calendar_event SET status='scheduled',version=version+1,updated_at=now() WHERE id=ANY($1::uuid[]) AND organization_id=$2 AND status='cancelled' RETURNING id",
        [p.ids, org],
      );
      if (!back.rowCount) throw new AccessError("NOT_FOUND", 404);
      for (const r of back.rows)
        await c.query("INSERT INTO calendar_history(event_id,actor_id,action,before_data,after_data) VALUES($1,$2,'restored',$3,$4)", [
          r.id,
          userId,
          JSON.stringify({ status: "cancelled" }),
          JSON.stringify({ status: "scheduled" }),
        ]);
      return;
    }
    case "payment": {
      const p = payload as Payloads["payment"];
      await one(
        "UPDATE finance_transaction SET cancelled_at=now(),cancelled_by=$3,cancel_reason='Annulé juste après l’encaissement' WHERE id=$1 AND organization_id=$2 AND cancelled_at IS NULL",
        [target, org, userId],
      );
      if (p.receivable && p.plan)
        await c.query(
          "INSERT INTO dues_history(organization_id,plan_id,receivable_id,actor_id,action,before_data,after_data,reason) VALUES($1,$2,$3,$4,'payment_undone',$5,$6,'')",
          [org, p.plan, p.receivable, userId, JSON.stringify({ transaction: target }), JSON.stringify({ cancelled: true })],
        );
      return;
    }
  }
}
