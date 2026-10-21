/**
 * Pure layout of the calendar views (wave 15, 2.7): the period of a view, the
 * hours shown in the week grid, all-day events, side-by-side overlaps and the
 * spoken time used in each event's accessible name. No I/O, unit-tested.
 */
import { shiftLocal } from "./time";

export type PlannerView = "week" | "days3" | "month" | "list";

/** The days shown by a view around a reference day: [from, to). */
export function planRange(anchor: string, view: PlannerView) {
  if (view === "month") {
    const from = anchor.slice(0, 7) + "-01",
      d = new Date(from + "T12:00Z");
    d.setUTCMonth(d.getUTCMonth() + 1);
    return { from, to: d.toISOString().slice(0, 10) };
  }
  if (view === "week") {
    const weekday = new Date(anchor + "T12:00Z").getUTCDay(),
      from = shiftLocal(anchor + "T12:00", -((weekday + 6) % 7)).slice(0, 10);
    return { from, to: shiftLocal(from + "T12:00", 7).slice(0, 10) };
  }
  if (view === "days3") return { from: anchor, to: shiftLocal(anchor + "T12:00", 3).slice(0, 10) };
  return { from: anchor, to: shiftLocal(anchor + "T12:00", 31).slice(0, 10) };
}

/** The reference day after moving one period forward or back. */
export function movePeriod(anchor: string, view: PlannerView, direction: number) {
  if (view === "month") {
    const d = new Date(anchor.slice(0, 7) + "-01T12:00Z");
    d.setUTCMonth(d.getUTCMonth() + direction);
    return d.toISOString().slice(0, 10);
  }
  return shiftLocal(anchor + "T12:00", direction * (view === "week" ? 7 : view === "days3" ? 3 : 31)).slice(0, 10);
}

const minutes = (local: string) => Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));

/** An event that does not fit an hour slot: a whole day or more, or spread over several days. */
export function isAllDay(e: { local_start: string; local_end: string }) {
  const days = (Date.parse(e.local_end.slice(0, 10) + "T00:00Z") - Date.parse(e.local_start.slice(0, 10) + "T00:00Z")) / 86400000;
  if (days === 0) return minutes(e.local_end) - minutes(e.local_start) >= 23 * 60;
  // Ending at midnight the next day is still one evening.
  return !(days === 1 && minutes(e.local_end) === 0 && minutes(e.local_start) > 0);
}

/** First and last hour of the grid: 7 h to 22 h, widened to fit the timed events. */
export function hourBounds(events: { local_start: string; local_end: string }[], first = 7, last = 22) {
  let from = first,
    to = last;
  for (const e of events) {
    if (isAllDay(e)) continue;
    from = Math.min(from, Math.floor(minutes(e.local_start) / 60));
    const end = e.local_end.slice(0, 10) > e.local_start.slice(0, 10) ? 24 * 60 : minutes(e.local_end);
    to = Math.max(to, Math.ceil(end / 60));
  }
  return { from, to: Math.min(to, 24) };
}

/**
 * Overlapping events of one day side by side: each gets a column and the
 * number of columns of its cluster (events linked by overlaps).
 */
export function layoutDay<T extends { id: string; local_start: string; local_end: string }>(events: T[]) {
  const items = events
    .map((e) => ({ e, start: minutes(e.local_start), end: e.local_end.slice(0, 10) > e.local_start.slice(0, 10) ? 24 * 60 : Math.max(minutes(e.local_end), minutes(e.local_start) + 15) }))
    .sort((a, b) => a.start - b.start || b.end - a.end || a.e.id.localeCompare(b.e.id));
  const out: { e: T; start: number; end: number; col: number; cols: number }[] = [];
  let cluster: typeof out = [],
    clusterEnd = -1;
  const close = () => {
    const cols = Math.max(1, ...cluster.map((x) => x.col + 1));
    for (const x of cluster) x.cols = cols;
    cluster = [];
  };
  for (const it of items) {
    if (it.start >= clusterEnd) {
      close();
      clusterEnd = -1;
    }
    const taken = new Set(cluster.filter((x) => x.end > it.start).map((x) => x.col));
    let col = 0;
    while (taken.has(col)) col++;
    const placed = { ...it, col, cols: 1 };
    cluster.push(placed);
    out.push(placed);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  close();
  return out;
}

/** "18 h", "18 h 30" (fr), "18.30 u" (nl), "18:30" (en): the time as people say it. */
export function spokenTime(locale: "fr" | "nl" | "en", local: string) {
  const h = String(Number(local.slice(11, 13))),
    m = local.slice(14, 16);
  if (locale === "fr") return m === "00" ? `${h} h` : `${h} h ${m}`;
  if (locale === "nl") return m === "00" ? `${h} u` : `${h}.${m} u`;
  return `${h}:${m}`;
}

/** Answers of the people invited: present (or late, early), absent, none. */
export function answerCounts(attendance: { role: string; response: string }[]) {
  const players = attendance.filter((a) => a.role === "player");
  return {
    total: players.length,
    yes: players.filter((a) => a.response === "present").length,
    no: players.filter((a) => a.response === "absent").length,
    none: players.filter((a) => a.response !== "present" && a.response !== "absent").length,
  };
}

/** The links of the services that subscribe to a calendar feed from its address. */
export function subscribeLinks(url: string, name: string) {
  const webcal = url.replace(/^https?:\/\//, "webcal://");
  return {
    webcal,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`,
  };
}

