import type { PoolClient } from "pg";

/**
 * 25: the tournament's single « arbitre » field and the designations stay in
 * step. The field shown on the tournament (and the report rights it gives)
 * is the main referee who accepted; the organiser's choice in the tournament
 * editor is an accepted main designation.
 */
export async function mirrorTournamentReferee(c: PoolClient, tournamentMatchId: string) {
  await c.query(
    `UPDATE tournament_match SET referee_user_id=(SELECT referee_id FROM tournament_referee_assignment
        WHERE tournament_match_id=$1 AND role='main' AND status='accepted' ORDER BY answered_at DESC NULLS LAST LIMIT 1)
      WHERE id=$1`,
    [tournamentMatchId],
  );
}

export async function designateFromTournament(c: PoolClient, tournamentMatchId: string, refereeId: string | null, by: string) {
  await c.query(
    "UPDATE tournament_referee_assignment SET status='withdrawn',answered_at=now() WHERE tournament_match_id=$1 AND role='main' AND status IN ('proposed','accepted') AND referee_id IS DISTINCT FROM $2",
    [tournamentMatchId, refereeId],
  );
  if (refereeId)
    await c.query(
      `INSERT INTO tournament_referee_assignment(tournament_match_id,federation_id,referee_id,role,status,assigned_by,answered_at)
       SELECT m.id,CASE WHEN o.kind='federation' THEN o.id ELSE o.federation_id END,$2,'main','accepted',$3,now()
         FROM tournament_match m JOIN tournament t ON t.id=m.tournament_id JOIN organization o ON o.id=t.organization_id
        WHERE m.id=$1 AND (o.kind='federation' OR o.federation_id IS NOT NULL)
       ON CONFLICT (tournament_match_id,referee_id) DO UPDATE SET role='main',status='accepted',assigned_by=EXCLUDED.assigned_by,answered_at=now()`,
      [tournamentMatchId, refereeId, by],
    );
}
