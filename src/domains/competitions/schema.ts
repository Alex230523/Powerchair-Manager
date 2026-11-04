import { z } from "zod";

const id = z.uuid();
const text = (n: number) => z.string().trim().max(n);
/** Local date and time in Brussels, as typed in a datetime-local field. */
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const matchKinds = ["league", "cup", "tournament", "friendly"] as const;
export const matchStatuses = [
  "scheduled",
  "played",
  "postponed",
  "cancelled",
] as const;

const matchFields = {
  teamId: id,
  opponent: text(120).min(2),
  home: z.boolean(),
  kind: z.enum(matchKinds),
  competition: text(120),
  startsAt: localDateTime,
  venue: text(200),
  calendarEventId: id.nullable(),
  notes: text(2000),
};
const statLine = z.object({
  profileId: id,
  minutes: z.number().int().min(0).max(200),
  goals: z.number().int().min(0).max(50),
  assists: z.number().int().min(0).max(50),
  yellowCards: z.number().int().min(0).max(2),
  redCard: z.boolean(),
});
export const clubCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...matchFields }),
  z.object({
    action: z.literal("update"),
    id,
    version: z.number().int().positive(),
    status: z.enum(matchStatuses).exclude(["played"]),
    ...matchFields,
  }),
  z.object({
    action: z.literal("lineup"),
    id,
    players: z
      .array(
        z.object({
          profileId: id,
          starter: z.boolean(),
          position: text(40),
          jerseyNumber: z.number().int().min(0).max(99).nullable(),
        }),
      )
      .max(30),
  }),
  z.object({
    action: z.literal("result"),
    id,
    version: z.number().int().positive(),
    ourScore: z.number().int().min(0).max(99),
    theirScore: z.number().int().min(0).max(99),
    stats: z.array(statLine).max(30),
  }),
]);
export type ClubCommand = z.infer<typeof clubCommand>;

/**
 * Wave 17 (C5): a friendly between clubs, its invitation, the score proposed
 * by one club and confirmed by the other, and the transport to organise.
 */
export const friendlyCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("friendly"),
    teamId: id,
    /** A team of a club of the federation, or none for an opponent outside the platform. */
    opponentTeamId: id.nullable(),
    opponentName: text(120),
    home: z.boolean(),
    startsAt: localDateTime,
    placeId: id.nullable(),
    venue: text(200),
    message: text(500).default(""),
  }),
  z.object({ action: z.literal("answerInvitation"), id, accept: z.boolean(), answer: text(500).default("") }),
  z.object({ action: z.literal("cancelInvitation"), id }),
  z.object({ action: z.literal("confirmScore"), id }),
  z.object({ action: z.literal("organizeTransport"), id }),
]);
export type FriendlyCommand = z.infer<typeof friendlyCommand>;

export type TransportState = "home" | "ready" | "todo";
/** « En ordre » at our home hall, or with a linked trip that has a vehicle and a driver; else to organise. */
export function transportState(m: { atHome: boolean; tripReady: boolean }): TransportState {
  if (m.atHome) return "home";
  return m.tripReady ? "ready" : "todo";
}

export type Answer = { name: string; response: string };
/** « Joueurs 7/9 »: those who said they come, out of those invited; names present first, then without answer. */
export function presenceLine(people: Answer[]) {
  const coming = people.filter((p) => p.response === "present");
  const waiting = people.filter((p) => p.response === "none");
  return { coming: coming.length, invited: people.length, names: [...coming.map((p) => p.name)], waiting: waiting.map((p) => p.name) };
}

/** Tournament matches grouped by match day, in date order then kick-off. */
export function byTournamentDay<M extends { day_id: string; day: string; label: string; tournament: string; kickoff: string }>(matches: M[]) {
  const days = new Map<string, { id: string; day: string; label: string; tournament: string; matches: M[] }>();
  for (const m of [...matches].sort((a, b) => a.day.localeCompare(b.day) || a.kickoff.localeCompare(b.kickoff))) {
    const g = days.get(m.day_id) ?? { id: m.day_id, day: m.day, label: m.label, tournament: m.tournament, matches: [] };
    g.matches.push(m);
    days.set(m.day_id, g);
  }
  return [...days.values()];
}

export const refereeCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("availability"),
    days: z
      .array(
        z.object({
          day: z.iso.date(),
          available: z.boolean(),
          note: text(200),
        }),
      )
      .min(1)
      .max(120),
  }),
  z.object({ action: z.literal("answer"), matchId: id, accept: z.boolean() }),
  z.object({
    action: z.literal("report"),
    matchId: id,
    homeScore: z.number().int().min(0).max(99),
    awayScore: z.number().int().min(0).max(99),
    incidents: text(4000),
  }),
]);
export type RefereeCommand = z.infer<typeof refereeCommand>;

export const federationCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    matchId: id,
    refereeId: z.string().min(1).max(200),
    role: z.enum(["main", "assistant", "table"]),
  }),
  z.object({
    action: z.literal("withdraw"),
    matchId: id,
    refereeId: z.string().min(1).max(200),
  }),
]);
export type FederationCommand = z.infer<typeof federationCommand>;

/** Matches that the federation follows (and designates referees for). */
export const officialKinds = ["league", "cup"] as const;

export type Result = {
  our_score: number | null;
  their_score: number | null;
  status: string;
  /** A score the other club proposed and nobody confirmed yet stays out of the figures (5). */
  score_status?: string;
};
export type Outcome = "win" | "draw" | "loss";
/** 5: the result of a played match, from our side (null while not played). */
export function outcomeOf(ours: number | null, theirs: number | null): Outcome | null {
  if (ours === null || theirs === null) return null;
  return ours > theirs ? "win" : ours < theirs ? "loss" : "draw";
}
/** 5: the last results of a team, oldest first, the latest last (confirmed scores only). */
export function formOf(matches: (Result & { starts_at: string | Date })[], n = 5) {
  return matches
    .filter((m) => m.status === "played" && m.score_status !== "proposed" && m.our_score !== null && m.their_score !== null)
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
    .slice(0, n)
    .reverse()
    .map((m) => outcomeOf(m.our_score, m.their_score)!);
}
/** Won, drawn, lost, goals and points (3, 1, 0) of played matches. */
export function teamRecord(matches: Result[]) {
  const out = {
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  };
  for (const m of matches) {
    if (m.status !== "played" || m.score_status === "proposed" || m.our_score === null || m.their_score === null)
      continue;
    out.played++;
    out.goalsFor += m.our_score;
    out.goalsAgainst += m.their_score;
    if (m.our_score > m.their_score) {
      out.won++;
      out.points += 3;
    } else if (m.our_score === m.their_score) {
      out.drawn++;
      out.points += 1;
    } else out.lost++;
  }
  return out;
}

export type StatRow = {
  starter: boolean;
  minutes: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_card: boolean;
};
/** Totals of a player over played matches. */
export function playerTotals(rows: StatRow[]) {
  return rows.reduce(
    (t, r) => ({
      matches: t.matches + 1,
      starts: t.starts + (r.starter ? 1 : 0),
      minutes: t.minutes + r.minutes,
      goals: t.goals + r.goals,
      assists: t.assists + r.assists,
      yellow: t.yellow + r.yellow_cards,
      red: t.red + (r.red_card ? 1 : 0),
    }),
    {
      matches: 0,
      starts: 0,
      minutes: 0,
      goals: 0,
      assists: 0,
      yellow: 0,
      red: 0,
    },
  );
}

/** The referee's report is written home/away; the club reads it from its side. */
export function fromOurSide(
  home: boolean,
  homeScore: number,
  awayScore: number,
) {
  return home
    ? { our: homeScore, their: awayScore }
    : { our: awayScore, their: homeScore };
}
