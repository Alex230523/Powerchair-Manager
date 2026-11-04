import { z } from "zod";

/** 6: national teams (no I/O: shared with the pages). */
export const teamCategories = ["senior", "u23", "u18", "women", "other"] as const;
export const staffRoles = ["head_coach", "assistant", "physio", "mechanic", "companion"] as const;
export const selectionStatuses = ["preselected", "selected", "reserve", "withdrawn"] as const;
export const gatheringKinds = ["camp", "training", "match"] as const;
const text = (n: number) => z.string().trim().max(n);
const id = z.uuid();
export const nationalCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("team"),
    id: id.optional(),
    name: text(80).min(2),
    category: z.enum(teamCategories),
    season: z.string().regex(/^\d{4}-\d{2}$/),
    color: z.enum(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]).default("c1"),
    maxPf2: z.number().int().min(0).max(20).nullable().default(null),
  }),
  z.object({ action: z.literal("staffAdd"), teamId: id, role: z.enum(staffRoles), profileId: id.optional(), userId: z.string().min(1).max(64).optional() }),
  z.object({ action: z.literal("staffRemove"), id }),
  z.object({ action: z.literal("select"), teamId: id, profileId: id, status: z.enum(selectionStatuses) }),
  z.object({ action: z.literal("gathering"), teamId: id, kind: z.enum(gatheringKinds), title: text(120).min(2), startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }), place: text(200).default("") }),
  z.object({ action: z.literal("enterTournament"), tournamentId: id, teamId: id }),
  z.object({ action: z.literal("guestTeam"), tournamentId: id, name: text(80).min(2) }),
  z.object({ action: z.literal("lineup"), matchId: id, teamId: id, players: z.array(z.object({ selectionId: id, starter: z.boolean(), goals: z.number().int().min(0).max(50), assists: z.number().int().min(0).max(50) })).max(30) }),
  z.object({ action: z.literal("award"), teamId: id, title: text(120).min(2), competition: text(120).default(""), place: z.number().int().min(1).max(500).nullable().default(null), awardedOn: z.iso.date() }),
]);
export type NationalCommand = z.infer<typeof nationalCommand>;
/** What the player (or a parent) answers. */
export const answerCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("availability"), selectionId: id, availability: z.enum(["available", "unavailable"]), note: text(500).default("") }),
  z.object({ action: z.literal("consent"), selectionId: id, startsOn: z.iso.date(), endsOn: z.iso.date() }),
  z.object({ action: z.literal("revoke"), consentId: id }),
  z.object({ action: z.literal("gathering"), gatheringId: id, selectionId: id, response: z.enum(["present", "absent"]) }),
]);
export type AnswerCommand = z.infer<typeof answerCommand>;
/** The age category of a player for a season label (« 2026-27 »): his age on 31 December of the first year. */
export function ageCategory(birth: string | null, season: string) {
  if (!birth) return "unknown";
  const age = Number(season.slice(0, 4)) - Number(birth.slice(0, 4));
  return age < 18 ? "u18" : age < 23 ? "u23" : "senior";
}
/** The number of PF2 a selection would have, and whether the rule allows it. */
export function pf2Allowed(selected: { classification: string }[], max: number | null) {
  const n = selected.filter((s) => s.classification === "PF2").length;
  return { count: n, ok: max === null || n <= max };
}
