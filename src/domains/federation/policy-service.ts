import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { fedCan } from "../access/policy";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { bpcfPolicy, policyOf, policySchema, type Policy } from "./policy";

/**
 * International, step 2 (05/11/2026): the federation reads and writes its
 * rulebook (amounts) and its country. The presidency and the workers with
 * the licences competence write; every change is kept with its version.
 */
export const policyCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), policy: policySchema }),
  z.object({ action: z.literal("reset") }),
  z.object({ action: z.literal("country"), code: z.string().regex(/^[A-Z]{2}$/) }),
]);
export type PolicyCommand = z.infer<typeof policyCommand>;

/** The policy that applies to a federation, for the other domains (transfers, fines). */
export async function policyFor(c: PoolClient, federationId: string | null): Promise<Policy> {
  if (!federationId) return bpcfPolicy;
  const row = (await c.query("SELECT policy FROM federation_policy WHERE federation_id=$1", [federationId])).rows[0];
  return policyOf(row?.policy);
}

export type Country = { code: string; name_fr: string; name_nl: string; name_en: string; currency: string };
export async function countries(c: PoolClient): Promise<Country[]> {
  return (await c.query("SELECT code,name_fr,name_nl,name_en,currency FROM country ORDER BY sort,code")).rows as Country[];
}

type Scope = { c: PoolClient; fed: string; userId: string; manage: boolean };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "federation") throw new AccessError("FEDERATION_ONLY");
    const manage = fedCan(a.role, a.grants, "federation.licences");
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

export type PolicyView = {
  organization_id: string;
  canManage: boolean;
  policy: Policy;
  /** Null while the federation applies the BPCF scale untouched. */
  version: number | null;
  updated_at: string | null;
  updated_by: string | null;
  isDefault: boolean;
  country: string;
  countries: Country[];
  history: { version: number; changed_at: string; changed_by: string }[];
};
export async function policyView(db: Pool, p: Principal): Promise<PolicyView> {
  return scope(db, p, false, async (s) => {
    const row = (await s.c.query('SELECT f.version,f.policy,f.updated_at,u.name AS updated_by FROM federation_policy f JOIN "user" u ON u.id=f.updated_by WHERE f.federation_id=$1', [s.fed])).rows[0];
    const org = (await s.c.query("SELECT country_code FROM organization WHERE id=$1", [s.fed])).rows[0];
    const history = (
      await s.c.query('SELECT h.version,h.changed_at,u.name AS changed_by FROM federation_policy_history h JOIN "user" u ON u.id=h.changed_by WHERE h.federation_id=$1 ORDER BY h.version DESC LIMIT 50', [s.fed])
    ).rows as PolicyView["history"];
    return {
      organization_id: s.fed,
      canManage: s.manage,
      policy: policyOf(row?.policy),
      version: row?.version ?? null,
      updated_at: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
      updated_by: row?.updated_by ?? null,
      isDefault: !row,
      country: org.country_code as string,
      countries: await countries(s.c),
      history,
    };
  });
}

export async function policyExecute(db: Pool, p: Principal, command: PolicyCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      if (command.action === "save") {
        const version = (
          await s.c.query(
            `INSERT INTO federation_policy(federation_id,version,policy,updated_by) VALUES($1,1,$2,$3)
             ON CONFLICT (federation_id) DO UPDATE SET version=federation_policy.version+1,policy=EXCLUDED.policy,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING version`,
            [s.fed, JSON.stringify(command.policy), s.userId],
          )
        ).rows[0].version as number;
        await s.c.query("INSERT INTO federation_policy_history(federation_id,version,policy,changed_by) VALUES($1,$2,$3,$4)", [s.fed, version, JSON.stringify(command.policy), s.userId]);
        await audit(s.c, s.fed, s.userId, "federation.policy.save", s.fed, { version });
        return { ok: true as const, version };
      }
      if (command.action === "reset") {
        // Back to the BPCF scale: the row goes, the history stays.
        await s.c.query("DELETE FROM federation_policy WHERE federation_id=$1", [s.fed]);
        await audit(s.c, s.fed, s.userId, "federation.policy.reset", s.fed);
        return { ok: true as const };
      }
      const ok = (await s.c.query("SELECT 1 FROM country WHERE code=$1", [command.code])).rowCount;
      if (!ok) throw new AccessError("NOT_FOUND", 404);
      // The federation's country is its clubs' country too.
      await s.c.query("UPDATE organization SET country_code=$2 WHERE id=$1 OR (kind='club' AND federation_id=$1)", [s.fed, command.code]);
      await audit(s.c, s.fed, s.userId, "federation.country", s.fed, { code: command.code });
      return { ok: true as const };
    },
    expected,
  );
}
