/**
 * Teams a receivable belongs to (wave 15): the team of its rate, or, for a
 * whole-club rate, the teams the player is a current member of. `d` is the
 * dues_receivable alias, `p` the dues_plan alias joined on d.plan_id.
 */
export const receivableTeamsSql = (d: string, p: string) =>
  `(CASE WHEN ${p}.team_id IS NOT NULL THEN ARRAY[${p}.team_id::text] ELSE COALESCE((SELECT array_agg(DISTINCT m.team_id::text) FROM team_membership m WHERE m.organization_id=${d}.organization_id AND m.profile_id=${d}.profile_id AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)),'{}'::text[]) END)`;
