/**
 * Pure calculations of the « Jeu » tab (wave 16, S2): results, form, goal
 * difference, per-match averages and leaders. Only played matches reach
 * them; the service filters on status.
 */
export type Outcome = "W" | "D" | "L";
export type PlayedMatch = { id: string; starts_at: string; team: string; opponent: string; kind: string; our: number; their: number };

export const outcome = (our: number, their: number): Outcome => (our > their ? "W" : our < their ? "L" : "D");

/** Played, won, drawn, lost, goals for and against, difference, win rate and the last five results (oldest first). */
export function record(matches: PlayedMatch[]) {
  const sorted = [...matches].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id));
  const r = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
  for (const m of sorted) {
    r.played++;
    r.goalsFor += m.our;
    r.goalsAgainst += m.their;
    const o = outcome(m.our, m.their);
    if (o === "W") r.won++;
    else if (o === "D") r.drawn++;
    else r.lost++;
  }
  return {
    ...r,
    difference: r.goalsFor - r.goalsAgainst,
    winRate: r.played ? Math.round((r.won / r.played) * 100) : null,
    form: sorted.slice(-5).map((m) => outcome(m.our, m.their)),
  };
}
/** A record per key (team, opponent, competition), sorted by name. */
export function recordsBy(matches: PlayedMatch[], key: (m: PlayedMatch) => string) {
  const groups = new Map<string, PlayedMatch[]>();
  for (const m of matches) groups.set(key(m), [...(groups.get(key(m)) ?? []), m]);
  return [...groups].map(([name, list]) => ({ name, ...record(list) })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Per match, two decimals; nothing without a match. */
export const perMatch = (total: number, matches: number) => (matches ? Math.round((total / matches) * 100) / 100 : null);

export type PlayerLine = { profile: string; name: string; team: string; matches: number; starts: number; minutes: number; goals: number; assists: number; yellow: number; red: number };
/** Adds up a player's lines (one per match played), whatever the team. */
export function playerLines(rows: { profile_id: string; full_name: string; team: string; starter: boolean; minutes: number; goals: number; assists: number; yellow_cards: number; red_card: boolean }[]) {
  const by = new Map<string, PlayerLine & { teams: Set<string> }>();
  for (const r of rows) {
    const p = by.get(r.profile_id) ?? { profile: r.profile_id, name: r.full_name, team: "", teams: new Set<string>(), matches: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0 };
    p.teams.add(r.team);
    p.matches++;
    if (r.starter) p.starts++;
    p.minutes += r.minutes;
    p.goals += r.goals;
    p.assists += r.assists;
    p.yellow += r.yellow_cards;
    if (r.red_card) p.red++;
    by.set(r.profile_id, p);
  }
  return [...by.values()].map(({ teams, ...p }) => ({ ...p, team: [...teams].sort().join(", ") }));
}
/** The top `limit` by a count, ties by name; nobody at zero. */
export function leaders(lines: PlayerLine[], by: "goals" | "assists", limit = 10) {
  return lines
    .filter((l) => l[by] > 0)
    .sort((a, b) => b[by] - a[by] || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((l) => ({ ...l, total: l[by], average: perMatch(l[by], l.matches) }));
}
