/**
 * Pure calculations of the « Club » statistics (wave 16, S1): ISO weeks, age
 * bands, distinct counts per season, ring segments. Kept apart from the
 * database and from React for the unit tests.
 */

const utc = (d: string) => new Date(d + "T12:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The Monday of the ISO week of a day. */
export function weekStart(day: string) {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return iso(d);
}
/** ISO week number and its year (the year of the week's Thursday). */
export function isoWeek(day: string) {
  const d = utc(weekStart(day));
  d.setUTCDate(d.getUTCDate() + 3);
  const year = d.getUTCFullYear();
  const first = utc(`${year}-01-04`);
  const firstMonday = utc(weekStart(iso(first)));
  return { year, week: 1 + Math.round((d.getTime() - firstMonday.getTime() - 3 * 86400000) / (7 * 86400000)) };
}
/** The Mondays of the weeks from `from` to `to`, at most 400. */
export function weeksBetween(from: string, to: string) {
  const out: string[] = [];
  const d = utc(weekStart(from));
  while (out.length < 400 && iso(d) <= to) {
    out.push(iso(d));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

/** Rates by bucket (month « YYYY-MM » or week Monday), null where nobody was expected: no zero for an empty week. */
export function rateSeries(buckets: string[], rows: { bucket: string; attended: number; invited: number }[]) {
  const sums = new Map<string, { attended: number; invited: number }>();
  for (const r of rows) {
    const s = sums.get(r.bucket) ?? { attended: 0, invited: 0 };
    s.attended += r.attended;
    s.invited += r.invited;
    sums.set(r.bucket, s);
  }
  return buckets.map((b) => {
    const s = sums.get(b);
    return s && s.invited ? Math.round((s.attended / s.invited) * 100) : null;
  });
}

export const ageBands = ["under12", "12to15", "16to18", "19to25", "26to40", "over40", "unknown"] as const;
export type AgeBand = (typeof ageBands)[number];
/** Age on a given day (whole years). */
export function ageOn(birth: string, on: string) {
  const [by, bm, bd] = birth.split("-").map(Number),
    [y, m, d] = on.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}
/** The band of a player, the age taken on 1 September of the season's first year. */
export function ageBand(birth: string | null, seasonStart: string): AgeBand {
  if (!birth) return "unknown";
  const age = ageOn(birth, `${seasonStart.slice(0, 4)}-09-01`);
  if (age < 0) return "unknown";
  return age < 12 ? "under12" : age <= 15 ? "12to15" : age <= 18 ? "16to18" : age <= 25 ? "19to25" : age <= 40 ? "26to40" : "over40";
}

export type SeasonMember = { profile: string; team: string; color: string | null };
/**
 * People per team of one season, and the season's total: a person in two
 * teams counts in each team but once in the total; `shared` says how many
 * people count twice or more in the bars.
 */
export function teamCounts(members: SeasonMember[]) {
  const teams = new Map<string, { name: string; color: string | null; people: Set<string> }>();
  const all = new Map<string, number>();
  for (const m of members) {
    const t = teams.get(m.team) ?? { name: m.team, color: m.color, people: new Set<string>() };
    if (!t.people.has(m.profile)) {
      t.people.add(m.profile);
      all.set(m.profile, (all.get(m.profile) ?? 0) + 1);
    }
    teams.set(m.team, t);
  }
  return {
    teams: [...teams.values()].map((t) => ({ name: t.name, color: t.color, count: t.people.size })).sort((a, b) => a.name.localeCompare(b.name)),
    total: all.size,
    shared: [...all.values()].filter((n) => n > 1).length,
  };
}
/** Distinct people per category (age band, classification): each person once, in one category. */
export function categoryCounts<K extends string>(people: { profile: string; category: K }[], order: readonly K[]) {
  const seen = new Map<string, K>();
  for (const p of people) if (!seen.has(p.profile)) seen.set(p.profile, p.category);
  return order.map((k) => ({ key: k, count: [...seen.values()].filter((c) => c === k).length }));
}

/** Win, draw and loss of a team: the ring's segments, as fractions of the turn (0 when no match). */
export function ringSegments(won: number, drawn: number, lost: number) {
  const total = won + drawn + lost;
  if (!total) return { total, segments: [] as { key: "won" | "drawn" | "lost"; start: number; end: number }[] };
  let at = 0;
  const segments: { key: "won" | "drawn" | "lost"; start: number; end: number }[] = [];
  for (const [key, n] of [
    ["won", won],
    ["drawn", drawn],
    ["lost", lost],
  ] as const) {
    if (!n) continue;
    segments.push({ key, start: at, end: at + n / total });
    at += n / total;
  }
  return { total, segments };
}
/** The SVG path of a ring segment between two fractions of the turn, from 12 o'clock clockwise. */
export function arcPath(cx: number, cy: number, r: number, inner: number, start: number, end: number) {
  const full = end - start >= 0.9999;
  if (full) end = start + 0.9999;
  const point = (radius: number, f: number) => {
    const a = f * 2 * Math.PI - Math.PI / 2;
    return `${(cx + radius * Math.cos(a)).toFixed(2)} ${(cy + radius * Math.sin(a)).toFixed(2)}`;
  };
  const large = end - start > 0.5 ? 1 : 0;
  return `M ${point(r, start)} A ${r} ${r} 0 ${large} 1 ${point(r, end)} L ${point(inner, end)} A ${inner} ${inner} 0 ${large} 0 ${point(inner, start)} Z`;
}
