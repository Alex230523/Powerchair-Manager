/**
 * The period of one chart of the statistics (wave 16, S1). Each chart has its
 * own, chosen in its « ... » menu and kept in the address (?p-<chart>=), so a
 * shared link shows the same thing. The seasons are counted back from the
 * season chosen in the top bar. Pure code, for the unit tests.
 */
export const periodKinds = ["season", "previous", "last3", "last5", "all", "custom"] as const;
export type PeriodKind = (typeof periodKinds)[number];
export type Period = { kind: PeriodKind; from?: string; to?: string };
export type SeasonSpan = { id: string; name: string; starts_on: string; ends_on: string };

const day = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (v: unknown): v is string => typeof v === "string" && day.test(v) && !Number.isNaN(Date.parse(v + "T12:00:00Z"));

/** Reads « last3 » or « custom:2025-09-01:2026-06-30 »; anything else is the default. */
export function parsePeriod(raw: string | null | undefined, fallback: PeriodKind = "season"): Period {
  if (!raw) return { kind: fallback };
  const [kind, from, to] = raw.split(":");
  if (kind === "custom") return validDay(from) && validDay(to) && from <= to ? { kind, from, to } : { kind: fallback };
  return (periodKinds as readonly string[]).includes(kind) ? { kind: kind as PeriodKind } : { kind: fallback };
}
export function serializePeriod(p: Period) {
  return p.kind === "custom" ? `custom:${p.from}:${p.to}` : p.kind;
}
/** The name of the address parameter of a chart. */
export const periodParam = (chart: string) => `p-${chart}`;

/**
 * The dates and seasons of a period. `seasons` is the club's list, any order;
 * `anchor` the season of the top bar (the current one by default). Without a
 * season at all, the last twelve months.
 */
export function resolvePeriod(seasons: SeasonSpan[], anchor: string | null, p: Period, today: string) {
  const sorted = [...seasons].sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const at = Math.max(
    0,
    anchor ? sorted.findIndex((s) => s.id === anchor) : sorted.findIndex((s) => s.starts_on <= today && today <= s.ends_on),
  );
  if (p.kind === "custom" && p.from && p.to) return { from: p.from, to: p.to, seasons: sorted.filter((s) => s.starts_on <= p.to! && s.ends_on >= p.from!) };
  if (!sorted.length) {
    const from = new Date(today + "T12:00:00Z");
    from.setUTCFullYear(from.getUTCFullYear() - 1);
    from.setUTCDate(from.getUTCDate() + 1);
    return { from: from.toISOString().slice(0, 10), to: today, seasons: [] as SeasonSpan[] };
  }
  const span = (first: number, last: number) => {
    const list = sorted.slice(Math.max(0, first), last + 1);
    return { from: list[0].starts_on, to: list[list.length - 1].ends_on, seasons: list };
  };
  switch (p.kind) {
    case "previous":
      return at > 0 ? span(at - 1, at - 1) : { from: sorted[0].starts_on, to: sorted[0].starts_on, seasons: [] as SeasonSpan[] };
    case "last3":
      return span(at - 2, at);
    case "last5":
      return span(at - 4, at);
    case "all":
      return span(0, Math.max(at, sorted.length - 1));
    default:
      return span(at, at);
  }
}
