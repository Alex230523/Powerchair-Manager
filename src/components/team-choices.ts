/**
 * 1: the teams of one season (the top bar's, else the most recent), each
 * once; a team chosen in another season stays in the list so the filter
 * never shows a value that is not there.
 */
export function teamChoices<T extends { id: string; name: string; season_id: string; starts_on?: string }>(teams: T[], seasonId: string | null, chosen: string) {
  const season = seasonId ?? [...teams].sort((a, b) => (b.starts_on ?? "").localeCompare(a.starts_on ?? ""))[0]?.season_id ?? null;
  const seen = new Set<string>();
  return teams.filter((t) => {
    if (t.id !== chosen && season && t.season_id !== season) return false;
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}
