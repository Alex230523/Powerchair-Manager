import type { Pool, PoolClient } from "pg";
import { fedCan, permissions } from "../access/policy";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { fineCommand, fineState, type FineCommand } from "./schema";
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
        return { ok: true as const, id };
      }
      const f = (await s.c.query("SELECT id,cancelled_at FROM federation_fine WHERE id=$1 AND federation_id=$2 FOR UPDATE", [command.id, s.org])).rows[0];
      if (!f) throw new AccessError("NOT_FOUND", 404);
      if (f.cancelled_at) throw new AccessError("INVALID_TRANSITION", 409);
      if (command.action === "paid") await s.c.query("UPDATE federation_fine SET paid_on=CASE WHEN $2 THEN CURRENT_DATE END WHERE id=$1", [f.id, command.paid]);
      else await s.c.query("UPDATE federation_fine SET cancelled_at=now() WHERE id=$1", [f.id]);
      await audit(s.c, s.org, s.userId, `fine.${command.action}`, f.id);
      return { ok: true as const, id: f.id as string };
    },
    expected,
  );
}
