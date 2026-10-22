/** Shared helpers of the statistics: rates, CSV, retention, months (the « Club » tab of wave 16 builds on them). */
export function percentage(n: number, d: number) {
  return d ? Math.round((n / d) * 100) : null;
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

/** The months of a period, "YYYY-MM", from the month of `from` to the month of `to` (wave 15, 2.6). */
export function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  const end = to.slice(0, 7);
  while (out.length < 240) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > end) break;
    out.push(key);
    if (++m > 12) [y, m] = [y + 1, 1];
  }
  return out;
}
