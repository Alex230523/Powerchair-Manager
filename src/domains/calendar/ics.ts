// RFC 5545: UTC instants and one stable VEVENT per materialized occurrence.
export function escapeIcs(s: string) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}
export function foldLine(s: string) {
  let line = "",
    bytes = 0;
  const result: string[] = [];
  for (const ch of s) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > 75) {
      result.push(line);
      line = " ";
      bytes = 1;
    }
    line += ch;
    bytes += n;
  }
  result.push(line);
  return result.join("\r\n");
}
export type IcsEvent = {
  id: string;
  title: string;
  starts_at: Date;
  ends_at: Date;
  updated_at: Date;
  version: number;
  status: string;
  location: string;
};
const stamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
export function calendarIcs(events: IcsEvent[], baseUrl: string) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Powerchair Football Manager//Calendar//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const e of events)
    lines.push(
      "BEGIN:VEVENT",
      "UID:" + e.id + "@pfm",
      "DTSTAMP:" + stamp(e.updated_at),
      "LAST-MODIFIED:" + stamp(e.updated_at),
      "DTSTART:" + stamp(e.starts_at),
      "DTEND:" + stamp(e.ends_at),
      "SEQUENCE:" + e.version,
      "STATUS:" + (e.status === "cancelled" ? "CANCELLED" : "CONFIRMED"),
      "SUMMARY:" + escapeIcs(e.title),
      "LOCATION:" + escapeIcs(e.location),
      "URL:" + baseUrl + "/fr/calendar",
      "END:VEVENT",
    );
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
