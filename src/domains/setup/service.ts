import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import { account, active, audit, requirePermission, AccessError, type Principal } from "../access/service";
import { setupSteps, type SetupState, type SetupStep } from "./schema";

/** The steps of a club, from its data (wave 15, C3). */
export async function setupState(c: PoolClient, org: string): Promise<SetupState> {
  const r = (
    await c.query(
      `SELECT o.setup_hidden,
              EXISTS(SELECT 1 FROM organization_logo l WHERE l.organization_id=o.id) AS identity,
              EXISTS(SELECT 1 FROM season s WHERE s.organization_id=o.id AND NOT s.archived AND s.starts_on<=CURRENT_DATE AND s.ends_on>=CURRENT_DATE) AS season,
              EXISTS(SELECT 1 FROM team t JOIN season s ON s.id=t.season_id WHERE t.organization_id=o.id AND NOT t.archived AND NOT s.archived AND s.starts_on<=CURRENT_DATE AND s.ends_on>=CURRENT_DATE) AS team,
              EXISTS(SELECT 1 FROM role_assignment r WHERE r.organization_id=o.id AND r.role='coach' AND r.revoked_at IS NULL)
                OR EXISTS(SELECT 1 FROM invitation i WHERE i.organization_id=o.id AND i.role='coach' AND i.revoked_at IS NULL AND (i.accepted_at IS NOT NULL OR i.expires_at>now())) AS coach,
              EXISTS(SELECT 1 FROM club_person p WHERE p.organization_id=o.id AND p.status='active' AND 'player'=ANY(p.directory_roles)) AS players,
              EXISTS(SELECT 1 FROM dues_plan d WHERE d.organization_id=o.id) AS dues,
              EXISTS(SELECT 1 FROM audit_log a WHERE a.organization_id=o.id AND a.action='modules.changed') AS modules,
              o.presence_rules<>'{}'::jsonb AS presence
         FROM organization o WHERE o.id=$1`,
      [org],
    )
  ).rows[0];
  return { hidden: !!r?.setup_hidden, steps: setupSteps.map((id: SetupStep) => ({ id, done: !!r?.[id] })) };
}

/** Hide or show the card again (the president, from the card or from Settings > Club). */
export async function setupExecute(db: Pool, p: Principal, hidden: boolean, expected: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (a.organization_id !== expected) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const user = await account(c, p);
    requirePermission(a.role, a.grants, "mandates.manage", mfaSatisfied(!!user.twoFactorEnabled));
    await c.query("UPDATE organization SET setup_hidden=$2 WHERE id=$1", [a.organization_id, hidden]);
    await audit(c, a.organization_id, p.userId, hidden ? "setup.hidden" : "setup.shown", a.organization_id);
    const state = await setupState(c, a.organization_id);
    await c.query("COMMIT");
    return state;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** For Settings > Club: the steps and whether the card is hidden. */
export async function setupView(db: Pool, p: Principal) {
  const c = await db.connect();
  try {
    const a = await active(c, p);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const user = await account(c, p);
    requirePermission(a.role, a.grants, "mandates.manage", mfaSatisfied(!!user.twoFactorEnabled));
    return { organization_id: a.organization_id, ...(await setupState(c, a.organization_id)) };
  } finally {
    c.release();
  }
}
