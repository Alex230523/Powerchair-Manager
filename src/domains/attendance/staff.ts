/**
 * 13/11/2026: the coaches answer and are marked like the players, but apart.
 * A person invited to a session is « encadrement » (staff) when, on the day of
 * the session, they coach, assist or volunteer in the session's team; for a
 * session without a team, when the directory says coach and not player. The
 * staff never weigh on the players' figures: the minimum, the rates, the
 * answers counted on the calendar and the home.
 *
 * `profile`, `organization`, `team` and `day` (a timestamptz) are SQL expressions (columns or
 * parameters); `person` is the club_person alias of the invited profile.
 */
export function staffSql(profile: string, organization: string, team: string, day: string, person: string) {
  const member = (roles: string) =>
    `EXISTS(SELECT 1 FROM team_membership sm WHERE sm.profile_id=${profile} AND sm.organization_id=${organization} AND sm.team_id=${team} AND sm.role IN (${roles}) AND NOT sm.cancelled AND sm.closed_at IS NULL AND sm.starts_on<=((${day}) AT TIME ZONE 'Europe/Brussels')::date AND (sm.ends_on IS NULL OR sm.ends_on>=((${day}) AT TIME ZONE 'Europe/Brussels')::date))`;
  return `(${member("'coach','assistant','volunteer'")} OR (NOT ${member("'player'")} AND 'coach'=ANY(${person}.directory_roles) AND NOT 'coach'=ANY(${person}.former_roles) AND NOT 'player'=ANY(${person}.directory_roles)))`;
}
