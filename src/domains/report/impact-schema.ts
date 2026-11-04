import { z } from "zod";
import { clubCategories } from "../tasks/schema";

/**
 * H13: the impact report. Pure parts: the period, the indicators (a missing
 * datum is null, never 0), the volunteering formula, the commune read from a
 * Belgian postal address, the adjustments added to a figure.
 */
export const adjustable = ["volunteerHours", "sportHours", "sessions", "beneficiaries", "kilometres"] as const;
export type Adjustable = (typeof adjustable)[number];
export const defaultTaskHours: Record<(typeof clubCategories)[number], number> = { affiliation: 1, admin: 1, grants: 3, sponsors: 2, fundraising: 3, equipment: 1, sport: 2, events: 3, other: 1 };

const day = z.iso.date();
export const impactQuery = z.object({ from: day, to: day, grant: z.uuid().optional() }).refine((v) => v.to >= v.from && Date.parse(v.to) - Date.parse(v.from) <= 3 * 366 * 86400000, { message: "PERIOD" });
export const impactCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("settings"),
    taskHours: z.partialRecord(z.enum(clubCategories), z.number().min(0).max(40)),
    tripHours: z.number().min(0).max(48),
    hourlyRateCents: z.number().int().min(0).max(100000).nullable(),
  }),
  z.object({ action: z.literal("adjust"), from: day, to: day, indicator: z.enum(adjustable), delta: z.number().min(-100000).max(100000), note: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("removeAdjustment"), id: z.uuid() }),
  /** Files the report's PDF with a grant's justification. */
  z.object({ action: z.literal("attach"), grantId: z.uuid(), from: day, to: day, locale: z.enum(["fr", "nl", "en"]) }),
]);

/** The commune of a Belgian postal address (« Rue X 1, 4000 Liège » → « 4000 Liège »), or null. */
export function communeOf(address: string) {
  const m = /\b([1-9]\d{3})\s+([A-Za-zÀ-ÿ' -]+?)\s*(?:,|$)/u.exec(address.trim());
  return m ? `${m[1]} ${m[2].trim()}` : null;
}
/** Age on a day, from a birth date (null when unknown). */
export function ageOn(birth: string | null, on: string) {
  if (!birth) return null;
  let a = Number(on.slice(0, 4)) - Number(birth.slice(0, 4));
  if (on.slice(5) < birth.slice(5)) a--;
  return a;
}
export const ageBands = ["under12", "12to17", "18to29", "30to49", "50plus", "unknown"] as const;
export function ageBand(age: number | null): (typeof ageBands)[number] {
  if (age === null) return "unknown";
  return age < 12 ? "under12" : age < 18 ? "12to17" : age < 30 ? "18to29" : age < 50 ? "30to49" : "50plus";
}
/** Hours of volunteering: tasks done × the hours set per type, supervision, drivers. */
export function volunteerHours(tasks: { category: string; n: number }[], taskHours: Record<string, number>, supervisionHours: number, driverHours: number) {
  const fromTasks = tasks.reduce((n, t) => n + t.n * (taskHours[t.category] ?? defaultTaskHours[t.category as keyof typeof defaultTaskHours] ?? 1), 0);
  return { tasks: round(fromTasks), supervision: round(supervisionHours), drivers: round(driverHours), total: round(fromTasks + supervisionHours + driverHours) };
}
export const round = (n: number) => Math.round(n * 10) / 10;
/** A figure with the adjustments of its period added; null stays null unless adjusted. */
export function adjusted(value: number | null, deltas: { delta: number }[]) {
  if (!deltas.length) return value;
  return round((value ?? 0) + deltas.reduce((n, d) => n + d.delta, 0));
}
