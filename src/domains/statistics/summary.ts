import { localAt } from "../calendar/time";
export type StatisticalEvent = {
  id: string;
  kind: string;
  status: string;
  starts_at: string | Date;
  register: { closed_at: string | Date | null } | null;
  invitations: {
    profile_id: string;
    full_name: string;
    withdrawn_at: string | Date | null;
    response: string;
    actual: string;
  }[];
};
export type Counts = {
  invited: number;
  answered: number;
  closed: number;
  attended: number;
  absent: number;
  late: number;
  early: number;
};
const counts = (): Counts => ({
  invited: 0,
  answered: 0,
  closed: 0,
  attended: 0,
  absent: 0,
  late: 0,
  early: 0,
});
export function percentage(n: number, d: number) {
  return d ? Math.round((n / d) * 100) : null;
}
export function summarize(events: StatisticalEvent[], kind = "") {
  const total = counts(),
    people = new Map<string, Counts & { id: string; name: string }>(),
    months = new Map<string, Counts & { month: string }>();
  let sessions = 0,
    closedSessions = 0;
  for (const e of events) {
    if (e.status === "cancelled" || (kind && e.kind !== kind)) continue;
    sessions++;
    if (e.register?.closed_at) closedSessions++;
    for (const i of e.invitations) {
      if (i.withdrawn_at) continue;
      const person = people.get(i.profile_id) ?? {
          id: i.profile_id,
          name: i.full_name,
          ...counts(),
        },
        monthKey = localAt(e.starts_at, "Europe/Brussels").slice(0, 7),
        month = months.get(monthKey) ?? { month: monthKey, ...counts() };
      for (const row of [total, person, month]) {
        row.invited++;
        if (i.response !== "none") row.answered++;
        if (e.register?.closed_at) {
          row.closed++;
          if (["present", "late", "early"].includes(i.actual)) row.attended++;
          if (i.actual === "absent") row.absent++;
          if (i.actual === "late") row.late++;
          if (i.actual === "early") row.early++;
        }
      }
      people.set(i.profile_id, person);
      months.set(monthKey, month);
    }
  }
  return {
    total,
    sessions,
    closedSessions,
    people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)),
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}
export function statisticsCsv(rows: (string | number | null)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            const text = String(value ?? "");
            return (
              '"' +
              (/^[\s]*[=+@-]/.test(text) ? "'" : "") +
              text.replaceAll('"', '""') +
              '"'
            );
          })
          .join(";"),
      )
      .join("\r\n")
  );
}

/**
 * Retention from one season to the next: who stayed, who joined, who left.
 * A person counts once per season, whatever their number of teams.
 */
export function retention(seasons: { name: string; members: string[] }[]) {
  return seasons.map((s, i) => {
    const now = new Set(s.members);
    const before = i > 0 ? new Set(seasons[i - 1].members) : null;
    const stayed = before ? [...now].filter((m) => before.has(m)).length : null;
    return {
      season: s.name,
      members: now.size,
      stayed,
      joined: before ? now.size - (stayed ?? 0) : null,
      left: before ? before.size - (stayed ?? 0) : null,
      rate: before && before.size ? Math.round(((stayed ?? 0) * 100) / before.size) : null,
    };
  });
}
