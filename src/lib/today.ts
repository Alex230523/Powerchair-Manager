/**
 * 13/11/2026: the day in Brussels (YYYY-MM-DD), the same « today » as the
 * database's CURRENT_DATE (migration 0148). Never `toISOString().slice(0, 10)`,
 * which is the day in UTC: the day before, between midnight and 1 am (2 am in
 * summer) in Brussels.
 */
export function brusselsDay(at: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
