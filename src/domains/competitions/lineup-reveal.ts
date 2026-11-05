import type { Pool } from "pg";
import { notice } from "../notifications/notice";

/**
 * Point 13 (04/11/2026): once a line-up is revealed (by hand, or on its own
 * at the time chosen), the players in it and their parents are told once.
 * Each match apart, so one failure does not hold the others.
 */
export async function lineupRevealTick(db: Pool) {
  const due = (
    await db.query(
      `SELECT m.id,m.organization_id,m.opponent FROM match m
        WHERE m.lineup_notified_at IS NULL AND m.status='scheduled' AND m.starts_at>now()-interval '3 hours'
          AND (m.lineup_published_at IS NOT NULL OR (m.lineup_reveal_minutes IS NOT NULL AND now()>=m.starts_at-make_interval(mins=>m.lineup_reveal_minutes)))
          AND EXISTS(SELECT 1 FROM match_player p WHERE p.match_id=m.id)
        ORDER BY m.starts_at LIMIT 50`,
    )
  ).rows as { id: string; organization_id: string; opponent: string }[];
  let sent = 0;
  for (const m of due) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const fresh = await c.query("UPDATE match SET lineup_notified_at=now() WHERE id=$1 AND lineup_notified_at IS NULL RETURNING id", [m.id]);
      if (fresh.rowCount) {
        const people = (
          await c.query(
            `WITH profiles AS (
               SELECT p.profile_id AS id FROM match_player p WHERE p.match_id=$1
               UNION SELECT g.guardian_profile_id FROM guardian_relationship g JOIN match_player p ON p.profile_id=g.subject_profile_id AND p.match_id=$1
                WHERE g.organization_id=$2 AND g.revoked_at IS NULL)
             SELECT DISTINCT u.id AS user_id,u.email,u.name,pe.locale FROM profiles x JOIN club_person cp ON cp.id=x.id AND cp.organization_id=$2
               JOIN person pe ON pe.id=cp.person_id JOIN "user" u ON u.id=pe.user_id AND u.active
               JOIN organization_membership om ON om.user_id=u.id AND om.organization_id=$2`,
            [m.id, m.organization_id],
          )
        ).rows;
        sent += await notice(
          c,
          m.organization_id,
          people,
          {
            fr: { title: `Composition dévoilée : contre ${m.opponent}`, message: `La composition du match contre ${m.opponent} est disponible.` },
            nl: { title: `Opstelling bekend: tegen ${m.opponent}`, message: `De opstelling van de wedstrijd tegen ${m.opponent} is beschikbaar.` },
            en: { title: `Line-up revealed: against ${m.opponent}`, message: `The line-up for the match against ${m.opponent} is available.` },
          },
          `/matches/${m.id}`,
          `lineup:${m.id}`,
        );
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return sent;
}
