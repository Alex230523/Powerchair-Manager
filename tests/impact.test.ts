import { describe, expect, it } from "vitest";
import { adjusted, ageBand, ageOn, communeOf, impactCommand, impactQuery, volunteerHours } from "../src/domains/report/impact-schema";
import { impactCopy } from "../src/components/impact-copy";
import { impactWords } from "../src/domains/report/impact";

/** H13: commune, age, volunteering, adjustments (null stays null), periods, texts. */
describe("impact report", () => {
  it("reads the municipality of a Belgian address, the age and its band", () => {
    expect(communeOf("Rue du Stade 1, 4000 Liège")).toBe("4000 Liège");
    expect(communeOf("Kerkstraat 3 9000 Gent")).toBe("9000 Gent");
    expect(communeOf("")).toBeNull();
    expect(ageOn("2014-09-02", "2026-09-01")).toBe(11);
    expect(ageBand(ageOn("2014-09-01", "2026-09-01"))).toBe("12to17");
    expect(ageBand(null)).toBe("unknown");
  });
  it("adds the tasks, the supervision and the drivers", () => {
    expect(volunteerHours([{ category: "admin", n: 2 }, { category: "events", n: 1 }], { admin: 1.5 }, 4, 3.25)).toEqual({ tasks: 6, supervision: 4, drivers: 3.3, total: 13.3 });
  });
  it("keeps a missing datum missing unless adjusted", () => {
    expect(adjusted(null, [])).toBeNull();
    expect(adjusted(0, [])).toBe(0);
    expect(adjusted(null, [{ delta: 5 }])).toBe(5);
    expect(adjusted(10, [{ delta: -2.5 }, { delta: 1 }])).toBe(8.5);
  });
  it("refuses a reversed or too long period, and an adjustment without reason", () => {
    expect(impactQuery.safeParse({ from: "2026-10-01", to: "2026-09-01" }).success).toBe(false);
    expect(impactQuery.safeParse({ from: "2020-01-01", to: "2026-01-01" }).success).toBe(false);
    expect(impactCommand.safeParse({ action: "adjust", from: "2026-09-01", to: "2026-10-01", indicator: "sessions", delta: 1, note: "" }).success).toBe(false);
  });
  it("has the same words in the three languages, no dash, no banned word", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    for (const c of [impactCopy, impactWords] as Record<string, object>[]) {
      expect(keys(c.nl)).toEqual(keys(c.fr));
      expect(keys(c.en)).toEqual(keys(c.fr));
      expect(JSON.stringify(c)).not.toMatch(/[–—]|convoqu|opgeroep|summon|call-up/i);
    }
  });
});
