import { describe, it, expect } from "vitest";
import { monthsBetween, retention } from "../src/domains/statistics/summary";
import { niceStep, trendSentence } from "../src/components/chart-math";
import { chartsCopy } from "../src/components/charts-copy";
import { statisticsCopy } from "../src/components/statistics-copy";
import { designCopy } from "../src/components/design-copy";

/** Wave 15 (2.6): data behind the charts, graduations, texts. */
const keys = (o: object): string[] =>
  Object.entries(o)
    .flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keys(v).map((x) => `${k}.${x}`) : [k]))
    .sort();
const texts = (o: object): string[] => Object.values(o).flatMap((v) => (v && typeof v === "object" ? texts(v) : [String(v)]));
describe("months", () => {
  it("lists every month of the period, across a year", () => {
    expect(monthsBetween("2026-11-15", "2027-02-01")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthsBetween("2026-10-01", "2026-10-31")).toEqual(["2026-10"]);
  });
});

describe("retention", () => {
  it("keeps the retention of the wave 12", () => {
    expect(retention([{ name: "a", members: ["1", "2"] }, { name: "b", members: ["2", "3"] }])[1]).toMatchObject({ stayed: 1, joined: 1, left: 1, rate: 50 });
  });
});

describe("chart helpers", () => {
  it("rounds graduations to 1, 2 or 5 times a power of ten", () => {
    expect([niceStep(0.7), niceStep(3), niceStep(6.5), niceStep(14), niceStep(0)]).toEqual([1, 5, 10, 20, 1]);
  });
  it("sums up a trend in one sentence", () => {
    const pct = (v: number) => `${v} %`;
    expect(trendSentence("Club", ["septembre", "octobre", "novembre"], [70, null, 85], pct)).toBe("Club : 70 % (septembre) → 85 % (novembre)");
    expect(trendSentence("Club", ["septembre"], [null], pct)).toBe("Club");
  });
  it("has the same texts in three languages, without long dashes", () => {
    for (const copy of [chartsCopy, statisticsCopy]) {
      expect(keys(copy.nl)).toEqual(keys(copy.fr));
      expect(keys(copy.en)).toEqual(keys(copy.fr));
      for (const l of ["fr", "nl", "en"] as const) for (const t of texts(copy[l])) expect(t).not.toMatch(/[–—]/);
    }
    for (const l of ["fr", "nl", "en"] as const) {
      expect(designCopy[l].charts.months).toHaveLength(6);
      for (const t of texts(designCopy[l].charts)) expect(t).not.toMatch(/[–—]/);
    }
  });
});
