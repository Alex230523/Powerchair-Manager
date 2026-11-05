import type { Pool, PoolClient } from "pg";

type Db = Pool | PoolClient;
export type KeyFigures = { players: number; pf1: number; pf2: number; teams: number; coaches: number; chairs: number; chairs_service: number; trainings: number; matches: number };

/**
 * The key figures of a season (wave 16, A and S1), one function for the
 * president's home and the statistics tiles: distinct players and coaches
 * (head coach or assistant) of the season's teams, teams, the club's chairs,
 * trainings done (not cancelled, already over) and matches played (one row of
 * the match table per match). `teams`: the teams to count, null for all.
 */
export async function seasonKeyFigures(db: Db, org: string, season: { id: string; starts_on: string; ends_on: string }, teams: string[] | null): Promise<KeyFigures> {
  const live = `NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=LEAST(CURRENT_DATE,$3::date) AND (m.ends_on IS NULL OR m.ends_on>=GREATEST($2::date,LEAST(CURRENT_DATE,$3::date)))`;
  return (
    await db.query(
      `SELECT (SELECT count(DISTINCT m.profile_id)::int FROM team_membership m JOIN team t ON t.id=m.team_id WHERE t.organization_id=$1 AND t.season_id=$4 AND NOT t.archived AND m.role='player' AND ${live} AND ($5::uuid[] IS NULL OR t.id=ANY($5))) AS players,
              (SELECT count(DISTINCT m.profile_id)::int FROM team_membership m JOIN team t ON t.id=m.team_id JOIN player_sport_profile ps ON ps.profile_id=m.profile_id AND ps.organization_id=t.organization_id WHERE t.organization_id=$1 AND t.season_id=$4 AND NOT t.archived AND m.role='player' AND ps.classification='PF1' AND ${live} AND ($5::uuid[] IS NULL OR t.id=ANY($5))) AS pf1,
              (SELECT count(DISTINCT m.profile_id)::int FROM team_membership m JOIN team t ON t.id=m.team_id JOIN player_sport_profile ps ON ps.profile_id=m.profile_id AND ps.organization_id=t.organization_id WHERE t.organization_id=$1 AND t.season_id=$4 AND NOT t.archived AND m.role='player' AND ps.classification='PF2' AND ${live} AND ($5::uuid[] IS NULL OR t.id=ANY($5))) AS pf2,
              (SELECT count(*)::int FROM team t WHERE t.organization_id=$1 AND t.season_id=$4 AND NOT t.archived AND ($5::uuid[] IS NULL OR t.id=ANY($5))) AS teams,
              (SELECT count(DISTINCT m.profile_id)::int FROM team_membership m JOIN team t ON t.id=m.team_id WHERE t.organization_id=$1 AND t.season_id=$4 AND NOT t.archived AND m.role IN ('coach','assistant') AND ${live} AND ($5::uuid[] IS NULL OR t.id=ANY($5))) AS coaches,
              (SELECT count(*)::int FROM equipment_chair WHERE organization_id=$1 AND status<>'retired' AND ownership<>'player') AS chairs,
              (SELECT count(*)::int FROM equipment_chair WHERE organization_id=$1 AND status='maintenance' AND ownership<>'player') AS chairs_service,
              (SELECT count(*)::int FROM calendar_event e WHERE e.organization_id=$1 AND e.kind='training' AND e.status='scheduled' AND e.ends_at<now() AND e.starts_at>=$2::date AND e.starts_at<$3::date+1 AND ($5::uuid[] IS NULL OR e.team_id=ANY($5))) AS trainings,
              (SELECT count(*)::int FROM match x WHERE x.organization_id=$1 AND x.status='played' AND x.starts_at>=$2::date AND x.starts_at<$3::date+1 AND ($5::uuid[] IS NULL OR x.team_id=ANY($5))) AS matches`,
      [org, season.starts_on, season.ends_on, season.id, teams],
    )
  ).rows[0] as KeyFigures;
}

/** The club's treasury: every ledger line not cancelled, in minus out (the home's money card does the same). */
export async function treasury(db: Db, org: string) {
  return (
    await db.query(
      "SELECT COALESCE(sum(CASE WHEN direction='in' THEN amount_cents ELSE -amount_cents END),0)::int AS cents FROM finance_transaction WHERE organization_id=$1 AND cancelled_at IS NULL",
      [org],
    )
  ).rows[0].cents as number;
}
