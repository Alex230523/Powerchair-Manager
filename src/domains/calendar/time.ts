import { z } from "zod";
export const localTime = z
  .string()
  .regex(/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  .superRefine((v, c) => {
    if (
      !z.iso.date().safeParse(v.slice(0, 10)).success ||
      Number(v.slice(11, 13)) > 23 ||
      Number(v.slice(14, 16)) > 59
    )
      c.addIssue({ code: "custom", message: "Invalid local date" });
  });
export type Fold = "reject" | "earlier" | "later";
export function localAt(value: Date | number | string, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function shiftLocal(value: string, days: number) {
  localTime.parse(value);
  const date = new Date(value + "Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 16);
}
export function toInstant(value: string, zone: string, fold: Fold = "reject") {
  localTime.parse(value);
  const guess = Date.parse(value + "Z"),
    offsets = new Set<number>();
  try {
    for (let h = -48; h <= 48; h += 6) {
      const t = guess + h * 3600000;
      offsets.add(Date.parse(localAt(t, zone) + "Z") - t);
    }
  } catch {
    throw new Error("INVALID_TIMEZONE");
  }
  const found = [...offsets]
    .map((o) => guess - o)
    .filter((t) => localAt(t, zone) === value)
    .sort((a, b) => a - b);
  if (!found.length) throw new Error("NONEXISTENT_TIME");
  if (found.length > 1 && fold === "reject") throw new Error("AMBIGUOUS_TIME");
  return new Date(fold === "later" ? found[found.length - 1] : found[0]);
}
