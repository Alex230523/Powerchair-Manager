import type { Pool, PoolClient } from "pg";
import { fedCan } from "../access/policy";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { brusselsToday } from "../people/service";
import { commissionCommand, type CommissionCommand, type DecisionKind } from "./schema";
export { commissionCommand };

/**
 * Lot 6 (05/11/2026): the journal of the commission. The federation's
 * president and its workers with the licences competence read and write;
 * each member signs the decisions in their own name.
 */
type Scope = { c: PoolClient; fed: string; userId: string; manage: boolean };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "federation") throw new AccessError("FEDERATION_ONLY");
    const manage = fedCan(a.role, a.grants, "federation.licences") || fedCan(a.role, a.grants, "federation.discipline");
    if (!manage && !fedCan(a.role, a.grants)) throw new AccessError("FORBIDDEN");
    if (write && !manage) throw new AccessError("FORBIDDEN");
    await account(c, p);
    const out = await fn({ c, fed: a.organization_id, userId: p.userId, manage });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** Written by the application when the federation decides something elsewhere (transfers, fines). */
export async function recordDecision(c: PoolClient, fed: string, by: string, d: { kind: DecisionKind; subject: string; decision: string; reference?: string; signed?: boolean }) {
  const id = (
    await c.query("INSERT INTO federation_decision(federation_id,kind,subject,decision,reference,decided_on,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
      fed,
      d.kind,
      d.subject.slice(0, 200),
      d.decision.slice(0, 2000),
      (d.reference ?? "").slice(0, 120),
      brusselsToday(),
      by,
    ])
  ).rows[0].id as string;
  // The person who decided has signed it; the other members add theirs.
  if (d.signed !== false) await c.query("INSERT INTO federation_decision_signature(decision_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [id, by]);
  return id;
}

export type Decision = {
  id: string;
  kind: DecisionKind;
  subject: string;
  decision: string;
  reference: string;
  decided_on: string;
  author: string;
  signatures: { user_id: string; name: string; signed_at: string }[];
  mine: boolean;
};
export async function commissionView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const rows = (
      await s.c.query(
        `SELECT d.id,d.kind,d.subject,d.decision,d.reference,d.decided_on::text AS decided_on,u.name AS author,
                COALESCE((SELECT json_agg(json_build_object('user_id',g.user_id,'name',su.name,'signed_at',g.signed_at) ORDER BY g.signed_at) FROM federation_decision_signature g JOIN "user" su ON su.id=g.user_id WHERE g.decision_id=d.id),'[]') AS signatures
           FROM federation_decision d JOIN "user" u ON u.id=d.created_by WHERE d.federation_id=$1 ORDER BY d.decided_on DESC,d.created_at DESC LIMIT 300`,
        [s.fed],
      )
    ).rows as Omit<Decision, "mine">[];
    // The members who may sign: the president and the workers with the licences or discipline competence.
    const members = (
      await s.c.query(
        `SELECT DISTINCT u.id,u.name FROM role_assignment r JOIN "user" u ON u.id=r.user_id AND u.active
          WHERE r.organization_id=$1 AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now())
            AND (r.role='federation_president' OR (r.role='federation_worker' AND (r.grants && ARRAY['federation.licences','federation.discipline']::text[]))) ORDER BY u.name`,
        [s.fed],
      )
    ).rows as { id: string; name: string }[];
    return {
      organization_id: s.fed,
      canManage: s.manage,
      members,
      decisions: rows.map((d) => ({ ...d, mine: d.signatures.some((g) => g.user_id === s.userId) })),
    };
  });
}

export async function commissionExecute(db: Pool, p: Principal, command: CommissionCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      if (command.action === "record") {
        const id = (
          await s.c.query("INSERT INTO federation_decision(federation_id,kind,subject,decision,reference,decided_on,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
            s.fed,
            command.kind,
            command.subject,
            command.decision,
            command.reference ?? "",
            command.decidedOn,
            s.userId,
          ])
        ).rows[0].id as string;
        await s.c.query("INSERT INTO federation_decision_signature(decision_id,user_id) VALUES($1,$2)", [id, s.userId]);
        await audit(s.c, s.fed, s.userId, "commission.recorded", id, { kind: command.kind });
        return { ok: true as const, id };
      }
      const d = (await s.c.query("SELECT id FROM federation_decision WHERE id=$1 AND federation_id=$2", [command.id, s.fed])).rows[0];
      if (!d) throw new AccessError("NOT_FOUND", 404);
      if (command.action === "sign") await s.c.query("INSERT INTO federation_decision_signature(decision_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [d.id, s.userId]);
      else await s.c.query("DELETE FROM federation_decision_signature WHERE decision_id=$1 AND user_id=$2", [d.id, s.userId]);
      await audit(s.c, s.fed, s.userId, `commission.${command.action}`, d.id);
      return { ok: true as const, id: d.id as string };
    },
    expected,
  );
}
