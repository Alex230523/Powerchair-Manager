import { z } from "zod";
import { seasonOf } from "../finance/schema";

/**
 * 34: the federation's discipline. Pure parts shared by the service, the
 * pages and the tests.
 */
export const competitions = ["league", "cup", "tournament", "friendly"] as const;
export type Competition = (typeof competitions)[number];
export type Rule = {
  yellowThreshold: number;
  yellowMatches: number;
  redMatches: number;
  kinds: Competition[];
  reset: "season" | "never";
  yellowFineCents: number;
  redFineCents: number;
  appealDays: number;
};
/** Until the federation writes its own: the usual rules (three yellows, one match; a red, one match). */
export const defaultRule: Rule = { yellowThreshold: 3, yellowMatches: 1, redMatches: 1, kinds: ["league", "cup", "tournament"], reset: "season", yellowFineCents: 0, redFineCents: 0, appealDays: 7 };

const id = z.uuid();
const file = z.object({ filename: z.string().trim().min(1).max(200), mediaType: z.enum(["application/pdf", "image/png", "image/jpeg"]), data: z.string().max(7000000) });
export const seasonLabel = z.string().regex(/^\d{4}-\d{2}$/);
export const disciplineCommand = z.discriminatedUnion("action", [
  /** The federation (discipline competence). */
  z.object({
    action: z.literal("rules"),
    season: seasonLabel,
    yellowThreshold: z.number().int().min(1).max(20),
    yellowMatches: z.number().int().min(0).max(20),
    redMatches: z.number().int().min(0).max(20),
    kinds: z.array(z.enum(competitions)).min(1).max(4),
    reset: z.enum(["season", "never"]),
    yellowFineCents: z.number().int().min(0).max(1000000),
    redFineCents: z.number().int().min(0).max(1000000),
    appealDays: z.number().int().min(0).max(60),
  }),
  z.object({
    action: z.literal("decide"),
    id,
    decision: z.enum(["confirm", "modify", "cancel"]),
    matches: z.number().int().min(0).max(99).optional(),
    fineCents: z.number().int().min(0).max(1000000).optional(),
    reason: z.string().trim().max(1000).default(""),
  }),
  /** A grave incident, a coach's or a club's sanction. */
  z.object({
    action: z.literal("manual"),
    clubId: id,
    profileId: id.nullable(),
    target: z.enum(["player", "coach", "club"]),
    matches: z.number().int().min(0).max(99),
    fineCents: z.number().int().min(0).max(1000000),
    summary: z.string().trim().min(3).max(500),
  }),
  z.object({ action: z.literal("decideAppeal"), id, accept: z.boolean(), decision: z.string().trim().max(1000).default("") }),
  /** The club (presidency). */
  z.object({ action: z.literal("appeal"), sanctionId: id, reason: z.string().trim().min(5).max(4000), file: file.nullable().default(null) }),
  z.object({ action: z.literal("payFine"), id, paidOn: z.iso.date() }),
]);
export type DisciplineCommand = z.infer<typeof disciplineCommand>;

/** The season of a day (« 2026-27 »). */
export const seasonOfDay = (day: string) => seasonOf(day).label;
/** A yellow that completes a series opens a suspension (the 3rd, the 6th… with a threshold of 3). */
export const yellowTriggers = (count: number, threshold: number) => count > 0 && count % threshold === 0;
/** One yellow away from the next suspension. */
export const nearThreshold = (count: number, threshold: number) => threshold > 1 && count % threshold === threshold - 1;
/** What remains of a suspension once some of its team's matches are played. */
export const remainingOf = (matches: number, served: number) => Math.max(0, matches - served);
/** The appeal is open until its last day included. */
export const appealOpen = (until: string | null, today: string) => !!until && today <= until;
