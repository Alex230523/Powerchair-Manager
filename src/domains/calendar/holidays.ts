/**
 * H9: Belgian public holidays and the dates of a weekly slot over a season.
 * Pure: shared by the service, the page and the tests.
 */
export const publicHolidayKeys = ["newYear", "easterMonday", "labourDay", "ascension", "whitMonday", "nationalDay", "assumption", "allSaints", "armistice", "christmas"] as const;
export type PublicHolidayKey = (typeof publicHolidayKeys)[number];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

/** Easter Sunday (Gregorian computus, anonymous algorithm). */
export function easter(year: number) {
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31),
    day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The ten Belgian public holidays of a year: fixed dates and the feasts tied to Easter. */
export function belgianPublicHolidays(year: number): { date: string; key: PublicHolidayKey }[] {
  const e = easter(year);
  const y = String(year);
  return [
    { date: `${y}-01-01`, key: "newYear" },
    { date: addDays(e, 1), key: "easterMonday" },
    { date: `${y}-05-01`, key: "labourDay" },
    { date: addDays(e, 39), key: "ascension" },
    { date: addDays(e, 50), key: "whitMonday" },
    { date: `${y}-07-21`, key: "nationalDay" },
    { date: `${y}-08-15`, key: "assumption" },
    { date: `${y}-11-01`, key: "allSaints" },
    { date: `${y}-11-11`, key: "armistice" },
    { date: `${y}-12-25`, key: "christmas" },
  ];
}

export type Skip = { kind: "holiday"; name: string } | { kind: "public"; key: PublicHolidayKey } | { kind: "closure"; name: string };
/** skip: why the date is left out (null when kept); was: the reason a reactivated date had. */
export type PlannedDate = { date: string; skip: Skip | null; was: Skip | null };

/** ISO weekday of a date: 1 Monday … 7 Sunday. */
export const weekdayOf = (day: string) => ((new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7) + 1;

/**
 * Every date of a weekly slot between two days, each with the reason it is
 * skipped (school holiday of the chosen reference, public holiday, closure
 * of the place or of the club), unless the club reactivated it.
 */
export function planDates(input: {
  from: string;
  to: string;
  weekday: number;
  holidays: { name: string; starts_on: string; ends_on: string }[];
  closures: { label: string; starts_on: string; ends_on: string }[];
  reactivated?: string[];
}): PlannedDate[] {
  const out: PlannedDate[] = [];
  let day = input.from;
  while (weekdayOf(day) !== input.weekday) day = addDays(day, 1);
  const years = new Set<number>();
  for (let y = Number(input.from.slice(0, 4)); y <= Number(input.to.slice(0, 4)); y++) years.add(y);
  const publics = new Map([...years].flatMap((y) => belgianPublicHolidays(y)).map((h) => [h.date, h.key]));
  for (; day <= input.to; day = addDays(day, 7)) {
    const holiday = input.holidays.find((h) => h.starts_on <= day && day <= h.ends_on);
    const closure = input.closures.find((c) => c.starts_on <= day && day <= c.ends_on);
    const pub = publics.get(day);
    const skip: Skip | null = closure ? { kind: "closure", name: closure.label } : holiday ? { kind: "holiday", name: holiday.name } : pub ? { kind: "public", key: pub } : null;
    const reactivated = !!skip && (input.reactivated ?? []).includes(day);
    out.push({ date: day, skip: reactivated ? null : skip, was: reactivated ? skip : null });
  }
  return out;
}

/** The school year a day belongs to (from 1 August): « 2026-2027 » for 15 September 2026. */
export function schoolYearOf(day: string) {
  const y = Number(day.slice(0, 4)),
    m = Number(day.slice(5, 7));
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
