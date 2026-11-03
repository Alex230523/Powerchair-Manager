import { z } from "zod";

/** 31: « Mon suivi » (no I/O: shared with the page). */
export const goalCategories = ["technique", "driving", "tactics", "behaviour", "other"] as const;
export const goalStatuses = ["to_work", "progressing", "acquired"] as const;
/** 1 to 5 objectives per player and per period. */
export const maxGoals = 5;
const text = (n: number) => z.string().trim().max(n);
const goal = { category: z.enum(goalCategories), title: text(200).min(2), detail: text(1000).default("") };
export const progressCommand = z.discriminatedUnion("action", [
  // The coach sets an objective; the player (or his parent) proposes one.
  z.object({ action: z.literal("goalCreate"), profileId: z.uuid(), period: text(40).min(1).optional(), ...goal }),
  z.object({ action: z.literal("goalPropose"), profileId: z.uuid(), ...goal }),
  z.object({ action: z.literal("goalEdit"), id: z.uuid(), version: z.number().int().positive(), ...goal }),
  z.object({ action: z.literal("goalStatus"), id: z.uuid(), status: z.enum(goalStatuses) }),
  z.object({ action: z.literal("goalDecide"), id: z.uuid(), accept: z.boolean() }),
  z.object({ action: z.literal("goalDelete"), id: z.uuid() }),
  // Dated feedback, read by the player and his parents.
  z.object({ action: z.literal("feedbackCreate"), profileId: z.uuid(), body: text(1000).min(2), eventId: z.uuid().nullable().default(null), matchId: z.uuid().nullable().default(null) }),
  z.object({ action: z.literal("feedbackDelete"), id: z.uuid() }),
  z.object({ action: z.literal("feedbackSeen"), id: z.uuid() }),
  z.object({ action: z.literal("feedbackReact"), id: z.uuid(), reaction: text(280).min(1) }),
  // The coach's private notes: never shown to the player nor his parents.
  z.object({ action: z.literal("noteCreate"), profileId: z.uuid(), body: text(2000).min(2) }),
  z.object({ action: z.literal("noteDelete"), id: z.uuid() }),
]);
export type ProgressCommand = z.infer<typeof progressCommand>;

/** One invitation of the season: when, a training or a match, what was seen on the day. */
export type Presence = { at: string; match: boolean; actual: string };
export type Figures = {
  trainings: { invited: number; present: number; rate: number | null; streak: number };
  matches: { invited: number; present: number; rate: number | null; streak: number };
  played: number;
  minutes: number;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
};
const here = (a: string) => a === "present" || a === "late" || a === "early";
/** Rate and current run of presences: only the days marked count, the latest first for the run. */
export function presence(rows: Presence[]) {
  const marked = rows.filter((r) => r.actual !== "unchecked").sort((a, b) => a.at.localeCompare(b.at));
  const present = marked.filter((r) => here(r.actual)).length;
  let streak = 0;
  for (let i = marked.length - 1; i >= 0 && here(marked[i].actual); i--) streak++;
  return { invited: marked.length, present, rate: marked.length ? Math.round((present / marked.length) * 100) : null, streak };
}
export function figures(rows: Presence[], games: { played: number; minutes: number; goals: number; assists: number; yellow: number; red: number }): Figures {
  return { trainings: presence(rows.filter((r) => !r.match)), matches: presence(rows.filter((r) => r.match)), ...games };
}
/** The difference with last season, for one number; null when there is nothing to compare. */
export function delta(now: number | null, before: number | null) {
  return now === null || before === null ? null : now - before;
}
