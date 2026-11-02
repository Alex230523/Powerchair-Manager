import { z } from "zod";

/**
 * 25 and 36 to 39: one refereeing circuit. Pure parts shared by the
 * service, the pages and the tests.
 */
export const designationRoles = ["main", "assistant", "table"] as const;
const id = z.uuid();
const target = z.object({ kind: z.enum(["match", "tournament"]), id });
const file = z.object({ filename: z.string().trim().min(1).max(200), mediaType: z.enum(["application/pdf", "image/png", "image/jpeg"]), data: z.string().max(7000000) });

export const refereeingCommand = z.discriminatedUnion("action", [
  /** The federation (refereeing competence). */
  z.object({ action: z.literal("designate"), target, refereeId: z.string().min(1).max(200), role: z.enum(designationRoles) }),
  z.object({ action: z.literal("withdraw"), target, refereeId: z.string().min(1).max(200) }),
  /** 2: a whole tournament day at once. */
  z.object({ action: z.literal("designateDay"), dayId: id, assignments: z.array(z.object({ matchId: id, refereeId: z.string().min(1).max(200), role: z.enum(designationRoles) })).min(1).max(80) }),
  z.object({ action: z.literal("level"), userId: z.string().min(1).max(200), level: z.number().int().min(0).max(19) }),
  z.object({ action: z.literal("settings"), levels: z.array(z.string().trim().min(1).max(40)).min(1).max(20), flatCents: z.number().int().min(0).max(100000), kmRateCents: z.number().int().min(0).max(500) }),
  z.object({ action: z.literal("decideTraining"), id, approve: z.boolean(), note: z.string().trim().max(500).default("") }),
  z.object({ action: z.literal("decideExpense"), id, approve: z.boolean(), reason: z.string().trim().max(300).default("") }),
  z.object({ action: z.literal("paid"), ids: z.array(id).min(1).max(200) }),
  /** The referee. */
  z.object({ action: z.literal("answer"), target, accept: z.boolean() }),
  z.object({ action: z.literal("training"), title: z.string().trim().min(2).max(160), doneOn: z.iso.date(), proof: file.nullable().default(null) }),
  z.object({ action: z.literal("expense"), target, km: z.number().min(0).max(5000), extraCents: z.number().int().min(0).max(100000), note: z.string().trim().max(500).default(""), proof: file.nullable().default(null) }),
  /** 4: the report on the phone (it may wait offline, then leave). */
  z.object({
    action: z.literal("report"),
    matchId: id,
    homeScore: z.number().int().min(0).max(99),
    awayScore: z.number().int().min(0).max(99),
    events: z
      .array(z.object({ kind: z.enum(["goal", "yellow", "red"]), side: z.enum(["home", "away"]), player: z.string().trim().max(120), profileId: id.nullable().default(null), minute: z.number().int().min(0).max(130).nullable() }))
      .max(80)
      .default([]),
    incidents: z.string().trim().max(4000).default(""),
    reserves: z.string().trim().max(2000).default(""),
  }),
  /** 4: a coach of one of the two clubs, within 48 hours. */
  z.object({ action: z.literal("review"), matchId: id, decision: z.enum(["confirmed", "contested"]), comment: z.string().trim().max(1000).default("") }),
]);
export type RefereeingCommand = z.infer<typeof refereeingCommand>;

/** 37: what a claim is worth: the flat fee, the kilometres at the federation's rate, the extra costs. */
export const expenseAmount = (flatCents: number, kmRateCents: number, km: number, extraCents: number) => flatCents + Math.round(km * kmRateCents) + extraCents;

/** 2: the warnings for a referee on a match: not available that day, from one of the two clubs, already designated at that time. */
export function warnings(
  match: { day: string; startsAt: string; clubs: string[] },
  referee: { clubs: string[]; unavailable: string[]; busy: string[] },
) {
  const out: ("unavailable" | "club" | "busy")[] = [];
  if (referee.unavailable.includes(match.day)) out.push("unavailable");
  if (referee.clubs.some((c) => match.clubs.includes(c))) out.push("club");
  if (referee.busy.some((t) => Math.abs(Date.parse(t) - Date.parse(match.startsAt)) < 90 * 60000)) out.push("busy");
  return out;
}

/** 3: the itinerary links of a place (no key: Google Maps and Waze search). */
export function routeLinks(place: string) {
  const q = encodeURIComponent(place.trim());
  return q ? { google: `https://www.google.com/maps/search/?api=1&query=${q}`, waze: `https://waze.com/ul?q=${q}&navigate=yes` } : null;
}

/** 4: a coach may confirm or contest within 48 hours of the report. */
export const reviewOpen = (submittedAt: string | Date, now = new Date()) => now.getTime() - new Date(submittedAt).getTime() <= 48 * 3600000;
