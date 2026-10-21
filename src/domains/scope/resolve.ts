/**
 * Pure part of the season and team scope (wave 12), shared by the browser
 * hook and the server: which season and team a raw choice resolves to,
 * given the lists the actor may see.
 */
export type SeasonLike = { id: string; archived: boolean; current: boolean };
export type TeamLike = { id: string; season_id: string; archived: boolean };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && uuid.test(v);
/** The current season, else the latest open one, else the latest, else nothing. */
export function defaultSeasonId<S extends SeasonLike>(seasons: S[]) {
  return seasons.find((s) => s.current)?.id ?? seasons.find((s) => !s.archived)?.id ?? seasons[0]?.id ?? null;
}
/** An invalid season or team falls back silently; a team must belong to the chosen season. */
export function resolve<S extends SeasonLike, T extends TeamLike>(
  seasons: S[],
  teams: T[],
  raw: { season?: string | null; team?: string | null },
) {
  const seasonId = raw.season && seasons.some((s) => s.id === raw.season) ? raw.season : defaultSeasonId(seasons);
  const team = raw.team ? teams.find((t) => t.id === raw.team && t.season_id === seasonId && !t.archived) : undefined;
  return { seasonId, teamId: team ? team.id : null };
}
