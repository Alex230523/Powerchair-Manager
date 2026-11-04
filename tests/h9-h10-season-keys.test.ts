import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { belgianPublicHolidays, easter, planDates, schoolYearOf, weekdayOf } from "../src/domains/calendar/holidays";
import { seasonScheduleCopy } from "../src/components/season-schedule-copy";
import { keysCopy } from "../src/components/keys-copy";
import { scheduleMail } from "../src/domains/calendar/season-schedule-copy";
import { keysTaskTitle } from "../src/domains/keys/keys-copy";

/** H9 and H10 (pure parts). */
const keys = (o: object): string[] => (typeof o !== "object" ? [] : Object.entries(o)).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keys(v).map((x) => `${k}.${x}`) : [k]));

describe("public holidays", () => {
  it("computes Easter and the feasts that follow it", () => {
    expect(easter(2026)).toBe("2026-04-05");
    expect(easter(2027)).toBe("2027-03-28");
    const y = Object.fromEntries(belgianPublicHolidays(2027).map((h) => [h.key, h.date]));
    expect(y).toMatchObject({ easterMonday: "2027-03-29", ascension: "2027-05-06", whitMonday: "2027-05-17", nationalDay: "2027-07-21", armistice: "2027-11-11" });
  });
});

describe("season dates", () => {
  const holidays = [{ name: "Congé d'automne", starts_on: "2026-10-19", ends_on: "2026-11-01" }];
  it("keeps the weekday, skips holidays, public holidays and closures, and brings a date back", () => {
    const d = planDates({ from: "2026-10-01", to: "2026-11-30", weekday: 3, holidays, closures: [{ label: "Travaux", starts_on: "2026-11-25", ends_on: "2026-11-25" }] });
    expect(d.every((x) => weekdayOf(x.date) === 3)).toBe(true);
    expect(d[0].date).toBe("2026-10-07");
    expect(d.filter((x) => x.skip).map((x) => [x.date, x.skip!.kind])).toEqual([
      ["2026-10-21", "holiday"],
      ["2026-10-28", "holiday"],
      ["2026-11-11", "public"],
      ["2026-11-25", "closure"],
    ]);
    const back = planDates({ from: "2026-10-01", to: "2026-11-30", weekday: 3, holidays, closures: [], reactivated: ["2026-10-21"] });
    expect(back.find((x) => x.date === "2026-10-21")).toEqual({ date: "2026-10-21", skip: null, was: { kind: "holiday", name: "Congé d'automne" } });
  });
  it("finds the school year of a day", () => {
    expect(schoolYearOf("2026-09-15")).toBe("2026-2027");
    expect(schoolYearOf("2027-03-01")).toBe("2026-2027");
  });
  it("ships the official holidays of both communities, without dropping anything", () => {
    const sql = readFileSync("db/migrations/0084_season_schedule.sql", "utf8");
    expect(sql).toContain("('fwb', '2026-2027', 'Congé d''automne', '2026-10-19', '2026-11-01'");
    expect(sql).toContain("('vl', '2026-2027', 'Herfstvakantie', '2026-11-02', '2026-11-08'");
    expect(sql).not.toMatch(/\bDROP\b/);
  });
});

describe("copy, jobs and keys", () => {
  it("speaks three languages", () => {
    for (const copy of [seasonScheduleCopy, keysCopy, scheduleMail, keysTaskTitle] as Record<string, object>[]) {
      expect(keys(copy.nl).sort()).toEqual(keys(copy.fr).sort());
      expect(keys(copy.en).sort()).toEqual(keys(copy.fr).sort());
    }
    for (const l of ["fr", "nl", "en"] as const) expect(seasonScheduleCopy[l].weekdays).toHaveLength(7);
  });
  it("sends the invitations by the daily jobs, and reminds the keys on departure", () => {
    expect(readFileSync("src/domains/jobs/registry.ts", "utf8")).toContain("seasonInvites: await seasonSlotInviteTick(db)");
    expect(readFileSync("src/domains/people/service.ts", "utf8").match(/keysOnDeparture\(c, org, command\.id/g)).toHaveLength(2);
  });
});
