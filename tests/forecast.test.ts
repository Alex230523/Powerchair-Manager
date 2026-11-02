import { describe, expect, it } from "vitest";
import { buildForecast, collectionRate, monthOf, monthsFrom, spread } from "../src/domains/finance/forecast-schema";
import { forecastCopy } from "../src/components/forecast-copy";

/** H4: months, where an amount falls, the two scenarios, the alert within three months, the texts. */
describe("cash forecast", () => {
  it("counts 12 months from today and puts an overdue amount in the current month", () => {
    const m = monthsFrom("2026-11-02");
    expect(m).toHaveLength(12);
    expect([m[0], m[2], m[11]]).toEqual(["2026-11", "2027-01", "2027-10"]);
    expect(monthOf("2026-08-01", m)).toBe("2026-11");
    expect(monthOf("2027-03-15", m)).toBe("2027-03");
    expect(monthOf("2028-01-01", m)).toBeNull();
  });
  it("spreads an amount without losing a cent, and reads last season's collection", () => {
    expect(spread(1000, ["a", "b", "c"]).map((x) => x.cents)).toEqual([333, 333, 334]);
    expect(collectionRate(0, 0)).toBe(1);
    expect(collectionRate(1000, 900)).toBe(0.9);
  });
  it("keeps the certain and the probable apart, and alerts in the first three months only", () => {
    const m = monthsFrom("2026-11-02");
    const f = buildForecast(10000, m, [
      { source: "venue", label: "Salle", month: m[1], direction: "out", cents: 8000, certain: true },
      { source: "grant", label: "Province", month: m[2], direction: "in", cents: 5000, certain: false },
      { source: "trip", label: "Tournoi", month: m[5], direction: "out", cents: 9000, certain: true },
    ], 3000);
    expect(f.rows[1]).toMatchObject({ certain: 2000, likely: 2000 });
    expect(f.rows[2]).toMatchObject({ certain: 2000, likely: 7000 });
    expect(f.alert).toMatchObject({ month: m[1], balance: 2000, biggest: [{ label: "Salle", cents: 8000 }] });
    expect(buildForecast(10000, m, [{ source: "trip", label: "Tournoi", month: m[5], direction: "out", cents: 9000, certain: true }], 3000).alert).toBeNull();
  });
  it("has the same words in the three languages, no dash, no banned word", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    expect(keys(forecastCopy.nl)).toEqual(keys(forecastCopy.fr));
    expect(keys(forecastCopy.en)).toEqual(keys(forecastCopy.fr));
    expect(JSON.stringify(forecastCopy)).not.toMatch(/[–—]|convoqu|opgeroep|summon|call-up/i);
  });
});
