import { z } from "zod";

/**
 * The weekly digest (wave 15, C7): what can be in it, when it leaves, and the
 * settings commands. Pure, so the clock and the validation are unit-tested.
 */
export const digestSections = ["todos", "events", "registrations", "documents", "dues", "readiness", "deadlines", "tasks", "treasury"] as const;
export type DigestSection = (typeof digestSections)[number];

/** Wednesday 7:30, the club default unless the president changes it. */
export const defaultDigestDay = 3;
export const defaultDigestMinute = 450;
/** 6:00 to 20:00 by half hours, in minutes after midnight. */
export const digestTimes = Array.from({ length: 29 }, (_, i) => 360 + i * 30);
/** The roles offered the digest: the president, on by default, and the coaches. */
export const digestRoles = ["club_president", "coach"] as const;

const day = z.number().int().min(1).max(7);
const minute = z
  .number()
  .int()
  .refine((m) => digestTimes.includes(m), "INVALID_TIME");
export const digestCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("digest"),
    enabled: z.boolean(),
    /** null: the club's day and time. */
    day: day.nullable(),
    minute: minute.nullable(),
    sections: z.array(z.enum(digestSections)).max(digestSections.length).transform((s) => [...new Set(s)]),
  }),
  z.object({ action: z.literal("digestClub"), day, minute }),
  z.object({ action: z.literal("digestPreview") }),
]);
export type DigestCommand = z.infer<typeof digestCommand>;

/** "7 h 30" in French, "7:30" otherwise. */
export function clockLabel(m: number, locale: "fr" | "nl" | "en") {
  const h = Math.floor(m / 60),
    mm = String(m % 60).padStart(2, "0");
  return locale === "fr" ? `${h} h ${mm}` : `${h}:${mm}`;
}

/** ISO week of a calendar date (YYYY-MM-DD), "2026-W43". */
export function isoWeek(date: string) {
  const d = new Date(date + "T12:00:00Z");
  const weekday = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - weekday);
  const year = d.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 1, 12));
  const week = Math.ceil(((d.getTime() - first.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The wall clock in Brussels (summer and winter time included): date, weekday 1 to 7, minute of the day, ISO week. */
export function brusselsClock(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Brussels",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const weekday = new Date(date + "T12:00:00Z").getUTCDay() || 7;
  return { date, day: weekday, minute: Number(parts.hour) * 60 + Number(parts.minute), week: isoWeek(date) };
}

/** Whether the digest of this person is due now: right day, time reached, not yet built this week. */
export function digestDue(clock: { day: number; minute: number }, when: { day: number; minute: number }, builtThisWeek: boolean) {
  return !builtThisWeek && clock.day === when.day && clock.minute >= when.minute;
}

/** The next date (YYYY-MM-DD, Brussels) the digest leaves, for the settings page. */
export function nextDigestDate(clock: { date: string; day: number; minute: number }, when: { day: number; minute: number }, builtThisWeek: boolean) {
  let ahead = (when.day - clock.day + 7) % 7;
  if (ahead === 0 && (builtThisWeek || clock.minute >= when.minute)) ahead = 7;
  // Already built this week on an earlier day: next week's slot.
  if (builtThisWeek && ahead + clock.day <= 7 && ahead !== 7) ahead += 7;
  const d = new Date(clock.date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + ahead);
  return d.toISOString().slice(0, 10);
}
