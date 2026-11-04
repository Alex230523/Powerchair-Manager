import { z } from "zod";

/**
 * H4: the 12-month cash forecast. Pure parts: the months, where a dated
 * amount falls, the two scenarios (certain only, certain and probable) and
 * the alert under the threshold within three months.
 */
export const forecastSources = ["dues", "grant", "sponsor", "fundraising", "budget", "venue", "trip", "affiliation", "task", "chair", "manual"] as const;
export type ForecastSource = (typeof forecastSources)[number];
export type ForecastItem = { source: ForecastSource; label: string; month: string; direction: "in" | "out"; cents: number; certain: boolean; id?: string };

export const forecastCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("line"),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    label: z.string().trim().min(2).max(160),
    direction: z.enum(["in", "out"]),
    amountCents: z.number().int().min(1).max(100000000),
    probable: z.boolean().default(false),
  }),
  z.object({ action: z.literal("removeLine"), id: z.uuid() }),
  z.object({ action: z.literal("threshold"), cents: z.number().int().min(-100000000).max(100000000) }),
]);

/** The n months from the one of `today`, as YYYY-MM. */
export function monthsFrom(today: string, n = 12) {
  const y = Number(today.slice(0, 4)),
    m = Number(today.slice(5, 7)) - 1;
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}
/** The month an amount falls in: an overdue one in the current month, beyond the horizon nowhere. */
export function monthOf(day: string, months: string[]) {
  const m = day.slice(0, 7);
  if (m < months[0]) return months[0];
  return months.includes(m) ? m : null;
}
/** An amount spread evenly over months (the cents left over in the last one). */
export function spread(cents: number, months: string[]) {
  if (!months.length || cents <= 0) return [];
  const part = Math.floor(cents / months.length);
  return months.map((m, i) => ({ month: m, cents: i === months.length - 1 ? cents - part * (months.length - 1) : part }));
}
/** The share of dues that came in last season (1 when nothing is known). */
export function collectionRate(net: number, paid: number) {
  return net > 0 ? Math.min(1, Math.max(0, paid / net)) : 1;
}

export function buildForecast(start: number, months: string[], items: ForecastItem[], threshold: number) {
  let certain = start,
    likely = start;
  const rows = months.map((month) => {
    const mine = items.filter((i) => i.month === month);
    const sum = (dir: "in" | "out", sure: boolean | null) => mine.filter((i) => i.direction === dir && (sure === null || i.certain === sure)).reduce((n, i) => n + i.cents, 0);
    certain += sum("in", true) - sum("out", true);
    likely += sum("in", null) - sum("out", null);
    return { month, inCertain: sum("in", true), outCertain: sum("out", true), inProbable: sum("in", false), outProbable: sum("out", false), certain, likely, items: mine.sort((a, b) => b.cents - a.cents) };
  });
  // The alert: the « certain » scenario under the threshold in the next three months.
  const low = rows.slice(0, 3).find((r) => r.certain < threshold) ?? null;
  return {
    start,
    threshold,
    rows,
    alert: low ? { month: low.month, balance: low.certain, biggest: low.items.filter((i) => i.direction === "out" && i.certain).slice(0, 3).map((i) => ({ label: i.label, cents: i.cents })) } : null,
  };
}
export type Forecast = ReturnType<typeof buildForecast>;
