import type { Pool, PoolClient } from "pg";
import { fedCan, permissions } from "../access/policy";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { fineCommand, fineState, type FineCommand } from "./schema";
import { autoEntry, cancelAuto } from "../finance/auto";
import { brusselsToday } from "../people/service";
import { recordDecision } from "../commission/service";
export { fineCommand };

/** Point 10: the federation's fines; the federation writes, each club reads its own. */
type Scope = { c: PoolClient; org: string; userId: string; federation: boolean; manage: boolean };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    await account(c, p);
    let federation = false,
      manage = false;
    if (a.kind === "federation") {
      if (!fedCan(a.role, a.grants, "federation.licences") && !fedCan(a.role, a.grants, "federation.finance")) throw new AccessError("FORBIDDEN");
      federation = true;
      manage = fedCan(a.role, a.grants, "federation.licences");
    } else if (a.kind === "club") {
      const rights = permissions(a.role, a.grants) as string[];
      if (a.role !== "club_president" && !rights.includes("dues.manage") && !rights.includes("dues.read")) throw new AccessError("FORBIDDEN");
    } else throw new AccessError("FORBIDDEN");
    if (write && !manage) throw new AccessError("FORBIDDEN");
    const out = await fn({ c, org: a.organization_id, userId: p.userId, federation, manage });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

type Row = { id: string; club_id: string; club: string; kind: string; amount_cents: number; issued_on: string; reason: string; paid_on: string | null; cancelled_at: string | null };
const columns = `f.id,f.club_id,o.name AS club,f.kind,f.amount_cents,f.issued_on::text AS issued_on,f.reason,f.paid_on::text AS paid_on,f.cancelled_at::text AS cancelled_at`;

export async function finesView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const rows = (
      await s.c.query(
        `SELECT ${columns} FROM federation_fine f JOIN organization o ON o.id=f.club_id
          WHERE ${s.federation ? "f.federation_id=$1" : "f.club_id=$1"} ORDER BY f.issued_on DESC,f.created_at DESC LIMIT 500`,
        [s.org],
      )
    ).rows as Row[];
    const clubs = s.federation ? ((await s.c.query("SELECT id,name FROM organization WHERE kind='club' AND federation_id=$1 ORDER BY lower(name)", [s.org])).rows as { id: string; name: string }[]) : [];
    const fines = rows.map((r) => ({ ...r, state: fineState(r) }));
    return {
      organization_id: s.org,
      mode: s.federation ? ("federation" as const) : ("club" as const),
      canManage: s.manage,
      clubs,
      fines,
      open: fines.filter((f) => f.state === "open").reduce((n, f) => n + f.amount_cents, 0),
    };
  });
}

export async function finesExecute(db: Pool, p: Principal, command: FineCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      if (command.action === "create") {
        const ok = (await s.c.query("SELECT 1 FROM organization WHERE id=$1 AND kind='club' AND federation_id=$2", [command.clubId, s.org])).rowCount;
        if (!ok) throw new AccessError("NOT_FOUND", 404);
        const id = (
          await s.c.query("INSERT INTO federation_fine(federation_id,club_id,kind,amount_cents,issued_on,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
            s.org,
            command.clubId,
            command.kind,
            command.amountCents,
            command.issuedOn,
            command.reason ?? "",
            s.userId,
          ])
        ).rows[0].id as string;
        await audit(s.c, s.org, s.userId, "fine.created", id, { club: command.clubId, amount: command.amountCents });
        const clubName = (await s.c.query("SELECT name FROM organization WHERE id=$1", [command.clubId])).rows[0].name as string;
        await recordDecision(s.c, s.org, s.userId, { kind: "fine", subject: `${clubName} : ${{ late: "retard", forfeit: "forfait", forfeit_day: "journée annulée", other: "amende" }[command.kind]}`, decision: `Amende de ${(command.amountCents / 100).toFixed(2)} €${command.reason ? ` · ${command.reason}` : ""}`, reference: id });
        // Lot 2 (05/11/2026): the club's presidency gets the task, 30 days to pay.
        const president = (await s.c.query("SELECT user_id FROM role_assignment WHERE organization_id=$1 AND role='club_president' AND revoked_at IS NULL ORDER BY created_at LIMIT 1", [command.clubId])).rows[0]?.user_id as string | undefined;
        const about = { late: "Retard", forfeit: "Forfait", forfeit_day: "Journée annulée", other: "Amende" }[command.kind];
        await s.c.query(
          `INSERT INTO task(organization_id,kind,category,title,due_on,responsible_user_id,origin,created_by,source_key,source_kind,source_params,amount_cents)
           VALUES($1,'other','affiliation',$2,$3::date+30,$4,'condition',$5,$6,'federationFine',$7,$8) ON CONFLICT DO NOTHING`,
          [command.clubId, `Payer l'amende : ${about}`.slice(0, 200), command.issuedOn, president ?? null, s.userId, `fine:${id}`, JSON.stringify({ about }), command.amountCents],
        );
        return { ok: true as const, id };
      }
      const f = (
        await s.c.query(
          "SELECT f.id,f.club_id,f.kind,f.amount_cents,f.cancelled_at,f.paid_on,c.name AS club,fe.name AS federation FROM federation_fine f JOIN organization c ON c.id=f.club_id JOIN organization fe ON fe.id=f.federation_id WHERE f.id=$1 AND f.federation_id=$2 FOR UPDATE OF f",
          [command.id, s.org],
        )
      ).rows[0] as { id: string; club_id: string; kind: string; amount_cents: number; cancelled_at: string | null; paid_on: string | null; club: string; federation: string } | undefined;
      if (!f) throw new AccessError("NOT_FOUND", 404);
      if (f.cancelled_at) throw new AccessError("INVALID_TRANSITION", 409);
      const about = { late: "Retard", forfeit: "Forfait", forfeit_day: "Journée annulée", other: "Amende" }[f.kind] ?? "Amende";
      if (command.action === "paid") {
        const today = brusselsToday();
        await s.c.query("UPDATE federation_fine SET paid_on=CASE WHEN $2 THEN CURRENT_DATE END WHERE id=$1", [f.id, command.paid]);
        if (command.paid) {
          // Lot 2: the club's expense and the federation's income, each in its own books; the task closes.
          const entry = { source: "fine" as const, ref: f.id, category: "competition" as const, amountCents: f.amount_cents, occurredOn: today, by: s.userId };
          await autoEntry(s.c, { ...entry, org: f.club_id, direction: "out", label: `Amende fédérale · ${about}`, counterparty: f.federation });
          await autoEntry(s.c, { ...entry, org: s.org, direction: "in", label: `Amende · ${f.club} · ${about}`, counterparty: f.club });
          await s.c.query("UPDATE task SET status='done',done_on=CURRENT_DATE,auto_closed=true,updated_at=now() WHERE organization_id=$1 AND source_key=$2 AND status<>'done'", [f.club_id, `fine:${f.id}`]);
        } else {
          await cancelAuto(s.c, f.club_id, "fine", f.id, s.userId, "Amende remise à payer");
          await cancelAuto(s.c, s.org, "fine", f.id, s.userId, "Amende remise à payer");
          await s.c.query("UPDATE task SET status='todo',done_on=NULL,auto_closed=false,updated_at=now() WHERE organization_id=$1 AND source_key=$2 AND auto_closed", [f.club_id, `fine:${f.id}`]);
        }
      } else {
        await s.c.query("UPDATE federation_fine SET cancelled_at=now() WHERE id=$1", [f.id]);
        if (f.paid_on) {
          await cancelAuto(s.c, f.club_id, "fine", f.id, s.userId, "Amende annulée");
          await cancelAuto(s.c, s.org, "fine", f.id, s.userId, "Amende annulée");
        }
        await s.c.query("UPDATE task SET status='done',done_on=CURRENT_DATE,auto_closed=true,updated_at=now() WHERE organization_id=$1 AND source_key=$2 AND status<>'done'", [f.club_id, `fine:${f.id}`]);
      }
      await audit(s.c, s.org, s.userId, `fine.${command.action}`, f.id);
      return { ok: true as const, id: f.id as string };
    },
    expected,
  );
}
