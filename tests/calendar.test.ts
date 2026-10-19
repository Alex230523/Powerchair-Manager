import { it, expect } from "vitest";
import { toInstant, localAt, shiftLocal } from "../src/domains/calendar/time";
import { calendarIcs, foldLine } from "../src/domains/calendar/ics";
it("keeps a weekly wall time through Brussels daylight saving changes", () => {
  const before = toInstant("2027-03-21T10:00", "Europe/Brussels"),
    after = toInstant(shiftLocal("2027-03-21T10:00", 7), "Europe/Brussels");
  expect(before.toISOString()).toBe("2027-03-21T09:00:00.000Z");
  expect(after.toISOString()).toBe("2027-03-28T08:00:00.000Z");
  expect(localAt(after, "Europe/Brussels")).toBe("2027-03-28T10:00");
});
it("rejects nonexistent hours and demands a choice for duplicated hours", () => {
  expect(() => toInstant("2027-03-28T02:30", "Europe/Brussels")).toThrow(
    "NONEXISTENT_TIME",
  );
  expect(() => toInstant("2027-10-31T02:30", "Europe/Brussels")).toThrow(
    "AMBIGUOUS_TIME",
  );
  expect(
    toInstant("2027-10-31T02:30", "Europe/Brussels", "later").getTime() -
      toInstant("2027-10-31T02:30", "Europe/Brussels", "earlier").getTime(),
  ).toBe(3600000);
});
it("handles invalid zones, UTC, leap days and local date shifting", () => {
  expect(() => toInstant("2027-01-01T10:00", "Not/AZone")).toThrow(
    "INVALID_TIMEZONE",
  );
  expect(toInstant("2028-02-29T10:00", "UTC").toISOString()).toBe(
    "2028-02-29T10:00:00.000Z",
  );
  expect(shiftLocal("2028-02-28T10:00", 2)).toBe("2028-03-01T10:00");
  expect(() => toInstant("2027-02-29T10:00", "UTC")).toThrow();
});
it("folds iCalendar lines by UTF8 octets and escapes injected properties", () => {
  const long = foldLine("SUMMARY:" + "Fauteuil électricité 🦽 ".repeat(20));
  expect(
    long.split("\r\n").every((line) => Buffer.byteLength(line) <= 75),
  ).toBe(true);
  expect(long.replace(/\r\n /g, "")).toBe(
    "SUMMARY:" + "Fauteuil électricité 🦽 ".repeat(20),
  );
  const ics = calendarIcs(
    [
      {
        id: "one",
        title: "Match\nATTENDEE:someone;test,ok",
        starts_at: new Date("2027-01-01T10:00Z"),
        ends_at: new Date("2027-01-01T11:00Z"),
        updated_at: new Date("2026-10-19T10:00Z"),
        version: 2,
        status: "cancelled",
        location: "Salle A",
      },
    ],
    "http://127.0.0.1:3000",
  );
  expect(ics).toContain("STATUS:CANCELLED\r\n");
  expect(ics).toContain("SEQUENCE:2\r\n");
  expect(ics).not.toContain("\r\nATTENDEE:");
  expect(ics).toContain("DTSTART:20270101T100000Z");
});
