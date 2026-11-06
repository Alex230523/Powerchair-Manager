import { z } from "zod";

/**
 * Tournaments (21 October 2026). Formats, rules, commands, and the pure
 * computations of the standings and the podium (tested without a database).
 */
export const formats = ["league", "groups_knockout", "knockout", "custom"] as const;
export type Format = (typeof formats)[number];
export const stages = ["league", "group", "round16", "quarter", "semi", "third", "final", "other"] as const;
export type Stage = (typeof stages)[number];
export const tiebreaks = ["goalDiff", "headToHead", "goalsFor"] as const;
export type Tiebreak = (typeof tiebreaks)[number];

const id = z.uuid();
const text = (n: number) => z.string().trim().max(n);

export const rulesSchema = z.object({
  /** League: each pair meets once or twice (home and away). */
  legs: z.union([z.literal(1), z.literal(2)]),
  /** Groups then knockout: number of groups and clubs going through from each. */
  groups: z.number().int().min(1).max(8),
  qualifiers: z.number().int().min(1).max(8),
  win: z.number().int().min(0).max(5),
  draw: z.number().int().min(0).max(5),
  loss: z.number().int().min(0).max(5),
  halves: z.number().int().min(1).max(4),
  halfMinutes: z.number().int().min(5).max(45),
  /** First criterion after the points. */
  tiebreak: z.enum(tiebreaks),
  /** Knockout: a draw is settled by a shootout. */
  shootout: z.boolean(),
  other: text(1000),
});
export type Rules = z.infer<typeof rulesSchema>;
/** Powerchair football defaults: two halves of twenty minutes, 3, 1 and 0 points. */
export const defaultRules: Rules = { legs: 1, groups: 2, qualifiers: 2, win: 3, draw: 1, loss: 0, halves: 2, halfMinutes: 20, tiebreak: "goalDiff", shootout: true, other: "" };
/** Stored rules, completed with the defaults (older or partial rows never break a page). */
export function readRules(raw: unknown): Rules {
  const merged = { ...defaultRules, ...(raw && typeof raw === "object" ? raw : {}) };
  const parsed = rulesSchema.safeParse(merged);
  return parsed.success ? parsed.data : defaultRules;
}

const tournamentFields = {
  name: text(120).min(2),
  year: z.number().int().min(2000).max(2100),
  format: z.enum(formats),
  rules: rulesSchema,
  description: text(2000),
  /** International, step 4 (06/11/2026): the layer of the competition (0 none, 1 top, 2 second, 3 regional...). */
  tier: z.number().int().min(0).max(9).default(0),
};
const statLine = z.object({
  profileId: id,
  goals: z.number().int().min(0).max(50),
  assists: z.number().int().min(0).max(50),
  yellowCards: z.number().int().min(0).max(2),
  redCard: z.boolean(),
});
const score = z.number().int().min(0).max(99);

export const tournamentCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...tournamentFields, clubs: z.array(id).max(64) }),
  z.object({ action: z.literal("update"), id, version: z.number().int().positive(), ...tournamentFields }),
  z.object({ action: z.literal("invite"), id, clubs: z.array(id).min(1).max(64) }),
  z.object({ action: z.literal("uninvite"), id, club: id }),
  z.object({ action: z.literal("group"), id, club: id, group: text(20) }),
  z.object({ action: z.literal("respond"), id, accept: z.boolean(), teamName: text(120), teamId: id.nullable().default(null) }),
  /** International, step 4: the club names (or changes) the team it plays with; its calendar follows. */
  z.object({ action: z.literal("team"), id, teamId: id.nullable() }),
  z.object({
    action: z.literal("day"),
    id,
    dayId: id.nullable(),
    label: text(120),
    day: z.iso.date(),
    venue: text(200),
    hostId: id.nullable(),
    notes: text(2000),
  }),
  z.object({ action: z.literal("removeDay"), id, dayId: id }),
  z.object({
    action: z.literal("match"),
    id,
    matchId: id.nullable(),
    dayId: id,
    kickoff: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    stage: z.enum(stages),
    group: text(20),
    home: id,
    away: id,
    refereeId: z.string().min(1).max(64).nullable(),
  }),
  z.object({ action: z.literal("removeMatch"), id, matchId: id }),
  z.object({
    action: z.literal("result"),
    id,
    matchId: id,
    version: z.number().int().positive(),
    homeScore: score,
    awayScore: score,
    homeShootout: score.nullable(),
    awayShootout: score.nullable(),
    stats: z.array(statLine).max(40),
    /** The organiser or the referee may validate in the same step. */
    validate: z.boolean(),
  }),
  z.object({ action: z.literal("validate"), id, matchId: id, version: z.number().int().positive() }),
  z.object({ action: z.literal("finish"), id }),
]);
export type TournamentCommand = z.infer<typeof tournamentCommand>;

export const photoCommand = z.object({
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  /** Base64, 1.5 MB at most once decoded. */
  data: z.string().max(2_100_000),
});

/* ------------------------------------------------------------- Computations */

export type ClubRef = { id: string; name: string; group: string };
export type MatchResult = {
  stage: Stage;
  group: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  homeShootout: number | null;
  awayShootout: number | null;
  status: "scheduled" | "reported" | "validated" | "cancelled";
};
export type StandingRow = {
  club: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
};

/** Only validated results count; a reported one is waiting for the organiser or the referee. */
export const counts = (m: MatchResult) => m.status === "validated" && m.homeScore !== null && m.awayScore !== null;

/**
 * The table of a league, of one group, or of a custom tournament's
 * "league" and "group" matches: points from the rules, then the chosen
 * tiebreak, then the other criteria, then the name.
 */
export function standings(clubs: ClubRef[], matches: MatchResult[], rules: Rules, group?: string): StandingRow[] {
  const inGroup = clubs.filter((c) => group === undefined || c.group === group);
  const ids = new Set(inGroup.map((c) => c.id));
  const rows = new Map<string, StandingRow>(
    inGroup.map((c) => [c.id, { club: c.id, name: c.name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 }]),
  );
  const played = matches.filter((m) => counts(m) && (m.stage === "league" || m.stage === "group" || m.stage === "other") && ids.has(m.home) && ids.has(m.away));
  for (const m of played) {
    const h = rows.get(m.home)!,
      a = rows.get(m.away)!;
    const hs = m.homeScore!,
      as = m.awayScore!;
    h.played++;
    a.played++;
    h.goalsFor += hs;
    h.goalsAgainst += as;
    a.goalsFor += as;
    a.goalsAgainst += hs;
    if (hs > as) {
      h.won++;
      a.lost++;
      h.points += rules.win;
      a.points += rules.loss;
    } else if (hs < as) {
      a.won++;
      h.lost++;
      a.points += rules.win;
      h.points += rules.loss;
    } else {
      h.drawn++;
      a.drawn++;
      h.points += rules.draw;
      a.points += rules.draw;
    }
  }
  for (const r of rows.values()) r.goalDiff = r.goalsFor - r.goalsAgainst;
  // Points between two clubs only (head to head).
  const between = (x: string, y: string) => {
    let px = 0,
      py = 0;
    for (const m of played) {
      if (!((m.home === x && m.away === y) || (m.home === y && m.away === x))) continue;
      const xs = m.home === x ? m.homeScore! : m.awayScore!,
        ys = m.home === x ? m.awayScore! : m.homeScore!;
      px += xs > ys ? rules.win : xs === ys ? rules.draw : rules.loss;
      py += ys > xs ? rules.win : xs === ys ? rules.draw : rules.loss;
    }
    return py - px;
  };
  const order: Tiebreak[] = [rules.tiebreak, ...tiebreaks.filter((t) => t !== rules.tiebreak)];
  return [...rows.values()].sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    for (const t of order) {
      const d = t === "goalDiff" ? y.goalDiff - x.goalDiff : t === "goalsFor" ? y.goalsFor - x.goalsFor : between(x.club, y.club);
      if (d) return d;
    }
    return x.name.localeCompare(y.name);
  });
}

/** Winner of a knockout match (score, then shootout), or null while undecided. */
export function winner(m: MatchResult): string | null {
  if (!counts(m)) return null;
  if (m.homeScore! !== m.awayScore!) return m.homeScore! > m.awayScore! ? m.home : m.away;
  if (m.homeShootout !== null && m.awayShootout !== null && m.homeShootout !== m.awayShootout) return m.homeShootout > m.awayShootout ? m.home : m.away;
  return null;
}

export type PodiumPlace = { rank: 1 | 2 | 3; club: string };
/**
 * The podium. Knockout formats: the final (winner and runner-up) and the
 * match for third place. League and custom: the top three of the table.
 * Empty while nothing is decided.
 */
export function podium(format: Format, clubs: ClubRef[], matches: MatchResult[], rules: Rules): PodiumPlace[] {
  if (format === "knockout" || format === "groups_knockout") {
    const out: PodiumPlace[] = [];
    const final = matches.find((m) => m.stage === "final" && winner(m));
    if (final) {
      const w = winner(final)!;
      out.push({ rank: 1, club: w }, { rank: 2, club: w === final.home ? final.away : final.home });
    }
    const third = matches.find((m) => m.stage === "third" && winner(m));
    if (third) out.push({ rank: 3, club: winner(third)! });
    return out;
  }
  const table = standings(clubs, matches, rules);
  if (!table.some((r) => r.played > 0)) return [];
  return table.slice(0, 3).map((r, i) => ({ rank: (i + 1) as 1 | 2 | 3, club: r.club }));
}
