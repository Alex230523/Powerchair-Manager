import { describe, it, expect } from "vitest";
import { answerCounts, hourBounds, isAllDay, layoutDay, movePeriod, planRange, spokenTime, subscribeLinks } from "../src/domains/calendar/planner";
import { qrMatrix, qrPath } from "../src/lib/qr";
import { plannerCopy } from "../src/components/calendar-planner-copy";

/** Wave 15 (2.7 and C9): periods, the week grid layout, spoken times, subscription links, QR code, texts. */
const ev = (id: string, start: string, end: string) => ({ id, local_start: start, local_end: end });

describe("calendar periods", () => {
  it("starts a week on Monday, three days on the day itself, a month on the 1st", () => {
    expect(planRange("2026-10-21", "week")).toEqual({ from: "2026-10-19", to: "2026-10-26" });
    expect(planRange("2026-10-25", "week")).toEqual({ from: "2026-10-19", to: "2026-10-26" });
    expect(planRange("2026-10-21", "days3")).toEqual({ from: "2026-10-21", to: "2026-10-24" });
    expect(planRange("2026-12-15", "month")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
  });
  it("moves by the length of the view", () => {
    expect(movePeriod("2026-10-21", "week", 1)).toBe("2026-10-28");
    expect(movePeriod("2026-10-21", "days3", -1)).toBe("2026-10-18");
    expect(movePeriod("2026-01-31", "month", 1)).toBe("2026-02-01");
  });
});

describe("week grid", () => {
  it("tells all-day events from timed ones", () => {
    expect(isAllDay(ev("a", "2026-10-19T18:00", "2026-10-19T20:00"))).toBe(false);
    expect(isAllDay(ev("b", "2026-10-19T00:00", "2026-10-20T00:00"))).toBe(true);
    expect(isAllDay(ev("c", "2026-10-19T20:00", "2026-10-20T00:00"))).toBe(false);
    expect(isAllDay(ev("d", "2026-10-19T09:00", "2026-10-21T17:00"))).toBe(true);
  });
  it("shows 7 h to 22 h, widened for an early or late event", () => {
    expect(hourBounds([ev("a", "2026-10-19T18:00", "2026-10-19T20:00")])).toEqual({ from: 7, to: 22 });
    expect(hourBounds([ev("a", "2026-10-19T06:30", "2026-10-19T08:00"), ev("b", "2026-10-19T21:00", "2026-10-19T23:15")])).toEqual({ from: 6, to: 24 });
  });
  it("puts overlapping events side by side and leaves the others full width", () => {
    const placed = layoutDay([
      ev("a", "2026-10-19T18:00", "2026-10-19T20:00"),
      ev("b", "2026-10-19T19:00", "2026-10-19T21:00"),
      ev("c", "2026-10-19T19:30", "2026-10-19T20:30"),
      ev("d", "2026-10-19T21:00", "2026-10-19T22:00"),
    ]);
    const by = Object.fromEntries(placed.map((x) => [x.e.id, [x.start, x.end, x.col, x.cols]]));
    expect(by.a).toEqual([1080, 1200, 0, 3]);
    expect(by.b).toEqual([1140, 1260, 1, 3]);
    expect(by.c).toEqual([1170, 1230, 2, 3]);
    expect(by.d).toEqual([1260, 1320, 0, 1]);
  });
  it("says times the way people do and counts the answers", () => {
    expect([spokenTime("fr", "2026-10-19T18:00"), spokenTime("fr", "2026-10-19T18:30"), spokenTime("nl", "2026-10-19T18:30"), spokenTime("en", "2026-10-19T08:05")]).toEqual(["18 h", "18 h 30", "18.30 u", "8:05"]);
    expect(answerCounts([{ role: "player", response: "present" }, { role: "player", response: "absent" }, { role: "player", response: "none" }, { role: "coach", response: "present" }])).toEqual({ total: 3, yes: 1, no: 1, none: 1 });
  });
});

describe("subscription", () => {
  it("builds webcal, Google and Outlook links from the private address", () => {
    const l = subscribeLinks("https://pfm.example.be/api/calendar/feed/abc", "Équipe A");
    expect(l.webcal).toBe("webcal://pfm.example.be/api/calendar/feed/abc");
    expect(l.google).toBe("https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Fpfm.example.be%2Fapi%2Fcalendar%2Ffeed%2Fabc");
    expect(l.outlook).toBe("https://outlook.live.com/calendar/0/addfromweb?url=https%3A%2F%2Fpfm.example.be%2Fapi%2Fcalendar%2Ffeed%2Fabc&name=%C3%89quipe%20A");
  });
  it("draws a QR code of the right version with its three finder patterns", () => {
    const m = qrMatrix("webcal://pfm.example.be/api/calendar/feed/" + "x".repeat(43))!;
    // 85 bytes at level M: version 6, 41 modules.
    expect(m.length).toBe(41);
    // Finder: dark border, light ring, dark core, at three corners only.
    for (const [x, y] of [
      [0, 0],
      [34, 0],
      [0, 34],
    ]) {
      expect(m[y][x] && m[y + 6][x + 6] && m[y + 3][x + 3]).toBe(true);
      expect(m[y + 1][x + 1]).toBe(false);
    }
    expect(m[40][40] && m[34][34] && m[35][35]).toBe(false);
    expect(qrMatrix("A")!.length).toBe(21);
    expect(qrMatrix("z".repeat(3000))).toBeNull();
    const path = qrPath(qrMatrix("A")!);
    expect(path.size).toBe(29);
    expect(path.d.startsWith("M4 4h1v1h-1z")).toBe(true);
  });
  it("has the same texts in the three languages, without long dashes", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(plannerCopy.nl)).toEqual(keys(plannerCopy.fr));
    expect(keys(plannerCopy.en)).toEqual(keys(plannerCopy.fr));
    for (const l of ["fr", "nl", "en"] as const) for (const t of Object.values(plannerCopy[l])) expect(t).not.toMatch(/[–—]/);
  });
});
