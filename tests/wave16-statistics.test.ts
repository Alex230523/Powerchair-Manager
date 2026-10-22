import { describe, it, expect } from "vitest";
import { ageBand, ageOn, arcPath, categoryCounts, isoWeek, rateSeries, ringSegments, teamCounts, weekStart, weeksBetween } from "../src/domains/statistics/club-math";
import { parsePeriod, resolvePeriod, serializePeriod } from "../src/domains/statistics/period";
import { fits, formatBytes, storageSummary } from "../src/domains/storage/summary";
import { originHref } from "../src/domains/storage/service";
import { awardCommand, bySeason, medalOf, publicAward } from "../src/domains/awards/schema";
import { placeLabel, statisticsCopy } from "../src/components/statistics-copy";

/** Wave 16 (S1): the calculations of the « Club » tab, storage and Hall of fame. */
describe("ISO weeks", () => {
  it("finds the Monday and the number of the week, across the turn of the year", () => {
    expect(weekStart("2026-10-21")).toBe("2026-10-19");
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
    expect(isoWeek("2026-10-21")).toEqual({ year: 2026, week: 43 });
    // 1 January 2027 is a Friday: still week 53 of 2026; 4 January is in week 1.
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
    expect(isoWeek("2027-01-04")).toEqual({ year: 2027, week: 1 });
    expect(isoWeek("2025-12-29")).toEqual({ year: 2026, week: 1 });
  });
  it("lists the Mondays of a period", () => {
    expect(weeksBetween("2026-10-21", "2026-11-05")).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
  });
  it("leaves a period without a session empty, never zero", () => {
    expect(
      rateSeries(
        ["2026-10-19", "2026-10-26", "2026-11-02"],
        [
          { bucket: "2026-10-19", attended: 1, invited: 2 },
          { bucket: "2026-10-19", attended: 2, invited: 2 },
          { bucket: "2026-11-02", attended: 0, invited: 3 },
        ],
      ),
    ).toEqual([75, null, 0]);
  });
});

describe("ages and distinct counts", () => {
  it("takes the age on 1 September of the season", () => {
    expect(ageOn("2014-09-02", "2026-09-01")).toBe(11);
    expect(ageOn("2014-09-01", "2026-09-01")).toBe(12);
    expect(ageBand("2014-09-02", "2026-08-15")).toBe("under12");
    expect(ageBand("2014-09-01", "2026-08-15")).toBe("12to15");
    expect(ageBand("2010-01-01", "2026-09-01")).toBe("16to18");
    expect(ageBand("2007-01-01", "2026-09-01")).toBe("19to25");
    expect(ageBand("1990-01-01", "2026-09-01")).toBe("26to40");
    expect(ageBand("1985-08-31", "2026-09-01")).toBe("over40");
    expect(ageBand(null, "2026-09-01")).toBe("unknown");
  });
  it("counts a person in each team but once in the total", () => {
    const c = teamCounts([
      { profile: "x", team: "Lions", color: "blue" },
      { profile: "x", team: "Aigles", color: "amber" },
      { profile: "x", team: "Lions", color: "blue" },
      { profile: "y", team: "Lions", color: "blue" },
    ]);
    expect(c).toEqual({
      teams: [
        { name: "Aigles", color: "amber", count: 1 },
        { name: "Lions", color: "blue", count: 2 },
      ],
      total: 2,
      shared: 1,
    });
    expect(
      categoryCounts(
        [
          { profile: "x", category: "PF1" },
          { profile: "x", category: "PF1" },
          { profile: "y", category: "PF2" },
        ],
        ["PF1", "PF2", "pending"] as const,
      ),
    ).toEqual([
      { key: "PF1", count: 1 },
      { key: "PF2", count: 1 },
      { key: "pending", count: 0 },
    ]);
  });
});

describe("rings", () => {
  it("splits the turn between wins, draws and losses, nothing without a match", () => {
    expect(ringSegments(7, 2, 3)).toEqual({
      total: 12,
      segments: [
        { key: "won", start: 0, end: 7 / 12 },
        { key: "drawn", start: 7 / 12, end: 9 / 12 },
        { key: "lost", start: 9 / 12, end: 1 },
      ],
    });
    expect(ringSegments(0, 0, 0)).toEqual({ total: 0, segments: [] });
    expect(ringSegments(0, 1, 0).segments).toEqual([{ key: "drawn", start: 0, end: 1 }]);
  });
  it("draws an arc from 12 o'clock, a full ring without collapsing", () => {
    expect(arcPath(60, 60, 59, 43, 0, 0.25)).toMatch(/^M 60\.00 1\.00 A 59 59 0 0 1 119\.00 60\.00/);
    expect(arcPath(60, 60, 59, 43, 0, 1)).toContain(" A 59 59 0 1 1 ");
  });
});

describe("periods", () => {
  const seasons = ["2022-23", "2023-24", "2024-25", "2025-26", "2026-27"].map((name, i) => ({
    id: String(i),
    name,
    starts_on: `${2022 + i}-09-01`,
    ends_on: `${2023 + i}-08-31`,
  }));
  it("reads and writes the address value, anything odd is the default", () => {
    expect(parsePeriod("last3")).toEqual({ kind: "last3" });
    expect(parsePeriod("custom:2026-01-01:2026-03-31")).toEqual({ kind: "custom", from: "2026-01-01", to: "2026-03-31" });
    expect(parsePeriod("custom:2026-03-31:2026-01-01")).toEqual({ kind: "season" });
    expect(parsePeriod("nope", "last5")).toEqual({ kind: "last5" });
    expect(parsePeriod(null, "last5")).toEqual({ kind: "last5" });
    expect(serializePeriod({ kind: "custom", from: "2026-01-01", to: "2026-03-31" })).toBe("custom:2026-01-01:2026-03-31");
  });
  it("counts the seasons back from the season of the top bar", () => {
    const at = (kind: Parameters<typeof resolvePeriod>[2]["kind"], anchor: string | null = null) => resolvePeriod(seasons, anchor, { kind }, "2026-10-21");
    expect(at("season")).toMatchObject({ from: "2026-09-01", to: "2027-08-31" });
    expect(at("previous").seasons.map((s) => s.name)).toEqual(["2025-26"]);
    expect(at("last3").seasons.map((s) => s.name)).toEqual(["2024-25", "2025-26", "2026-27"]);
    expect(at("last5")).toMatchObject({ from: "2022-09-01", to: "2027-08-31" });
    expect(at("all").seasons).toHaveLength(5);
    expect(at("season", "1").seasons.map((s) => s.name)).toEqual(["2023-24"]);
    expect(at("last3", "1").seasons.map((s) => s.name)).toEqual(["2022-23", "2023-24"]);
    expect(at("previous", "0").seasons).toEqual([]);
    expect(resolvePeriod(seasons, null, { kind: "custom", from: "2025-01-01", to: "2025-12-31" }, "2026-10-21").seasons.map((s) => s.name)).toEqual(["2024-25", "2025-26"]);
    expect(resolvePeriod([], null, { kind: "season" }, "2026-10-21")).toEqual({ from: "2025-10-22", to: "2026-10-21", seasons: [] });
  });
});

describe("storage", () => {
  const rows = [
    { category: "documents", bytes: "300", files: 3 },
    { category: "photos", bytes: 100, files: 1 },
  ];
  it("splits the quota between the categories and the free part", () => {
    const s = storageSummary(rows, 1000);
    expect(s).toMatchObject({ used: 400, free: 600, percent: 40, level: "ok" });
    expect(s.segments.find((x) => x.key === "documents")?.share).toBe(0.3);
    expect(s.segments.at(-1)).toEqual({ key: "free", share: 0.6 });
    expect(s.categories.map((c) => c.key)).toEqual(["documents", "registrations", "finance", "funding", "photos", "other"]);
    expect(storageSummary(rows, 480).level).toBe("warning");
    const over = storageSummary(rows, 200);
    expect(over).toMatchObject({ level: "full", free: 0, percent: 200 });
    expect(Math.round(over.segments.reduce((n, x) => n + x.share, 0) * 1000)).toBe(1000);
  });
  it("lets a file in up to the quota, not beyond", () => {
    expect(fits(900, 1000, 100)).toBe(true);
    expect(fits(900, 1000, 101)).toBe(false);
  });
  it("writes sizes in binary units, French symbols in French", () => {
    expect(formatBytes(312 * 1024 * 1024, "fr")).toBe("312 Mo");
    expect(formatBytes(1073741824, "fr")).toBe("1 Go");
    expect(formatBytes(1536, "en")).toBe("1.5 KB");
    expect(formatBytes(500, "nl")).toBe("500 B");
  });
  it("links a file to the page it comes from", () => {
    expect(originHref("exercise", "e1")).toBe("/exercises/e1");
    expect(originHref("partner", "p1")).toBe("/funding/grants-sponsors?vue=sponsoring&partner=p1");
    expect(originHref("logo", "x")).toBe("/settings/club");
  });
});

describe("Hall of fame", () => {
  const base = { action: "create", title: "Champion D2", competition: "", kind: "team", place: 1, awardedOn: "2026-05-01", seasonId: null, teamId: null, profileId: null, note: "", publishable: false, tripId: null };
  it("asks a person for an individual prize", () => {
    expect(awardCommand.safeParse(base).success).toBe(true);
    expect(awardCommand.safeParse({ ...base, kind: "individual" }).success).toBe(false);
    expect(awardCommand.safeParse({ ...base, kind: "individual", profileId: "8b0e7a8c-4b3e-4f43-9d8f-2d0f7f7b6a11" }).success).toBe(true);
    expect(awardCommand.safeParse({ ...base, title: "x" }).success).toBe(false);
    expect(awardCommand.safeParse({ ...base, place: 0 }).success).toBe(false);
  });
  it("gives a medal to the podium and a star otherwise, always with the place in words", () => {
    expect([1, 2, 3, 4, null].map(medalOf)).toEqual(["gold", "silver", "bronze", "star", "star"]);
    const fr = statisticsCopy.fr.awards,
      en = statisticsCopy.en.awards;
    expect([1, 2, null].map((p) => placeLabel(fr, p, "fr"))).toEqual(["1re place", "2e place", "Distinction"]);
    expect([1, 2, 3, 11, 22].map((p) => placeLabel(en, p, "en"))).toEqual(["1st place", "2nd place", "3rd place", "11th place", "22nd place"]);
  });
  it("never shows publicly a person's prize or a photo without « Peut être publié »", () => {
    const a = { kind: "individual", publishable: false, has_photo: true, person: "Ana" };
    expect(publicAward(a)).toBeNull();
    expect(publicAward({ ...a, publishable: true })).toMatchObject({ person: "Ana", has_photo: true });
    expect(publicAward({ ...a, kind: "team", person: null })).toMatchObject({ has_photo: false });
  });
  it("groups the prizes by season, the latest first", () => {
    const g = bySeason(
      [
        { season: "2025-26", awarded_on: "2026-05-01" },
        { season: "2026-27", awarded_on: "2026-10-01" },
        { season: null, awarded_on: "2024-01-01" },
        { season: "2025-26", awarded_on: "2026-06-01" },
      ],
      "Hors saison",
    );
    expect(g.map((x) => [x.season, x.items.map((i) => i.awarded_on)])).toEqual([
      ["2026-27", ["2026-10-01"]],
      ["2025-26", ["2026-06-01", "2026-05-01"]],
      ["Hors saison", ["2024-01-01"]],
    ]);
  });
});
