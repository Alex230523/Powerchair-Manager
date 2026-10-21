import type { Pool } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import { AccessError, account, active, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { headcount, retention } from "./summary";

/** Players per season (team memberships), oldest first: retention and the headcount chart (wave 15). */
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
        `SELECT s.name,s.starts_on,
                COALESCE(json_agg(json_build_object('profile',m.profile_id,'team',t.name,'color',t.color,'category',t.category) ORDER BY t.name) FILTER (WHERE m.profile_id IS NOT NULL),'[]') AS players
           FROM season s LEFT JOIN team t ON t.season_id=s.id AND t.organization_id=s.organization_id
           LEFT JOIN team_membership m ON m.team_id=t.id AND m.role='player' AND NOT m.cancelled
          WHERE s.organization_id=$1
          GROUP BY s.id ORDER BY s.starts_on DESC LIMIT 6`,
        [a.organization_id],
      )
    ).rows.reverse() as { name: string; players: { profile: string; team: string; color: string | null; category: string }[] }[];
    // Retention over six seasons (the first one is the base); the chart shows the last five.
    return {
      seasons: retention(rows.map((r) => ({ name: r.name, members: [...new Set(r.players.map((p) => p.profile))] }))),
      headcount: headcount(rows).slice(-5),
    };
  } finally {
    c.release();
  }
}
