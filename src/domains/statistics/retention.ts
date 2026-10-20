import type { Pool } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import { AccessError, account, active, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { retention } from "./summary";

/** Players per season (team memberships), oldest first, for the retention chart. */
export async function retentionView(db: Pool, p: Principal) {
  const c = await db.connect();
  try {
    const a = await active(c, p);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const user = await account(c, p);
    const rights = permissions(a.role, a.grants);
    if (
      !mfaSatisfied(!!user.twoFactorEnabled) ||
      !(rights.includes("people.read") || rights.includes("teams.manage"))
    )
      throw new AccessError("FORBIDDEN");
    const rows = (
      await c.query(
        `SELECT s.name,s.starts_on,COALESCE(array_agg(DISTINCT m.profile_id) FILTER (WHERE m.profile_id IS NOT NULL),'{}') AS members
           FROM season s LEFT JOIN team t ON t.season_id=s.id
           LEFT JOIN team_membership m ON m.team_id=t.id AND m.role='player' AND NOT m.cancelled
          WHERE s.organization_id=$1
          GROUP BY s.id ORDER BY s.starts_on DESC LIMIT 6`,
        [a.organization_id],
      )
    ).rows.reverse() as { name: string; members: string[] }[];
    return { seasons: retention(rows) };
  } finally {
    c.release();
  }
}
