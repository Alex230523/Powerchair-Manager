import { z } from "zod";

/**
 * « Fin de coach »: the departure's steps, generated only when they concern
 * the coach, each ticking by itself when its condition is met (or skipped
 * with a reason). Pure parts shared by the service, the page and the tests.
 */
export const departureKinds = ["replace", "tasks", "duties", "keys", "exercises", "rights", "notify", "thanks", "survey", "close"] as const;
export type DepartureKind = (typeof departureKinds)[number];
/** The steps a club may leave out of its departures; the rights and the closing always stay. */
export const optionalKinds: DepartureKind[] = ["notify", "thanks", "survey", "exercises"];
/** Blocking steps: open at the end date, the president is alerted (the rights are withdrawn anyway). */
export const blockingKinds: DepartureKind[] = ["replace", "keys"];
/** Steps ticked by hand (or by the coach); the others tick by themselves. */
export const manualKinds: DepartureKind[] = ["notify", "thanks", "survey", "exercises"];

const id = z.uuid();
export const offboardingCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), profileId: id, endsOn: z.iso.date(), reason: z.enum(["stopped", "moved", "unknown"]), note: z.string().trim().max(1000).default(""), notifyCoach: z.boolean().default(true), locale: z.enum(["fr", "nl", "en"]) }),
  z.object({ action: z.literal("cancel"), runId: id }),
  z.object({ action: z.literal("skip"), runId: id, key: z.string().max(80), reason: z.string().trim().min(3).max(300) }),
  /** 2: every open task of his, given at once to another person. */
  z.object({ action: z.literal("reassignTasks"), runId: id, toProfileId: id }),
  /** His coming sessions and trips, given to another person (with an account). */
  z.object({ action: z.literal("reassignDuties"), runId: id, toProfileId: id }),
  z.object({ action: z.literal("rightsEnd"), runId: id }),
  z.object({ action: z.literal("notify"), runId: id, locale: z.enum(["fr", "nl", "en"]) }),
  z.object({ action: z.literal("thanks"), runId: id, locale: z.enum(["fr", "nl", "en"]) }),
  /** The coach himself: three short answers. */
  z.object({ action: z.literal("survey"), runId: id, answers: z.object({ liked: z.string().trim().max(1000), change: z.string().trim().max(1000), back: z.string().trim().max(1000) }) }),
  /** The coach himself, never anyone else: his private sheets copied to the club's library, or left. */
  z.object({ action: z.literal("exercises"), runId: id, choice: z.enum(["copy", "keep"]) }),
  z.object({ action: z.literal("settings"), skip: z.array(z.enum(["notify", "thanks", "survey", "exercises"])).max(4) }),
]);
export type OffboardingCommand = z.infer<typeof offboardingCommand>;

const minus = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") - n * 86400000).toISOString().slice(0, 10);
/** The deadline of each step, before the end date (never before today). */
export function dueBefore(endsOn: string, kind: DepartureKind, today: string) {
  const days: Record<DepartureKind, number> = { replace: 14, tasks: 7, duties: 7, keys: 0, exercises: 3, rights: 0, notify: 7, thanks: 0, survey: 0, close: 0 };
  const d = minus(endsOn, days[kind]);
  return d < today ? today : d;
}

/** Progress of a departure: the steps done or skipped out of all. */
export function departureProgress(steps: { done_at: string | Date | null }[]) {
  const done = steps.filter((s) => s.done_at).length;
  return { done, total: steps.length, percent: steps.length ? Math.round((done * 100) / steps.length) : 100 };
}
