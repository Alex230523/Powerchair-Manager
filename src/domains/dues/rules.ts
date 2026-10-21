import { z } from "zod";

/**
 * Automatic dues reminders (wave 11), set in Réglages. When `auto` is on, the
 * worker writes to the families a few days before an instalment, then again
 * once it is late, and repeats every `repeatDays` while something stays due.
 */
export const duesRulesSchema = z.object({
  auto: z.boolean(),
  daysBefore: z.number().int().min(0).max(60),
  daysAfter: z.number().int().min(0).max(60),
  repeatDays: z.number().int().min(7).max(90),
});
export type DuesRules = z.infer<typeof duesRulesSchema>;
export const defaultDuesRules: DuesRules = { auto: false, daysBefore: 7, daysAfter: 7, repeatDays: 14 };
export function duesRules(stored: unknown): DuesRules {
  const parsed = duesRulesSchema.partial().safeParse(stored ?? {});
  return { ...defaultDuesRules, ...(parsed.success ? parsed.data : {}) };
}
/** Whether a reminder is due today for one receivable, given its open instalments. */
export function reminderDue(
  rules: DuesRules,
  open: { due_on: string }[],
  lastSent: string | null,
  today: string,
): "before" | "late" | null {
  if (!rules.auto || !open.length) return null;
  const since = lastSent ? daysBetween(lastSent, today) : Infinity;
  if (since < rules.repeatDays) return null;
  const next = open[0].due_on;
  const until = daysBetween(today, next);
  if (until < 0 && -until >= rules.daysAfter) return "late";
  if (until >= 0 && until <= rules.daysBefore) return "before";
  return null;
}
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
}
