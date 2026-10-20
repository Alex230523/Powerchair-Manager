import { describe, expect, it } from "vitest";
import { siblingDiscount, siblingRanks } from "../src/domains/dues/schema";
import { potProgress } from "../src/domains/fundraising/service";
import { retention } from "../src/domains/statistics/summary";
import { nextYear, suggestedName } from "../src/domains/seasons/rollover";
import { paidInFull } from "../src/domains/dues/attestation";

describe("sibling discount", () => {
  const kids = [
    { id: "lucas", birth_date: "2013-04-30", full_name: "Lucas" },
    { id: "emma", birth_date: "2010-12-03", full_name: "Emma" },
    { id: "zoe", birth_date: "2015-01-01", full_name: "Zoé" },
    { id: "tom", birth_date: "2012-05-05", full_name: "Tom" },
  ];
  it("ranks the children of a family by age, families found through shared parents", () => {
    const guardians = new Map([
      ["lucas", new Set(["nadia"])],
      ["emma", new Set(["nadia", "marc"])],
      ["zoe", new Set(["marc"])],
    ]);
    const ranks = siblingRanks(kids, guardians);
    expect(Object.fromEntries(ranks)).toEqual({ emma: 1, lucas: 2, zoe: 3, tom: 1 });
  });
  it("gives the eldest the full price, then the two percentages", () => {
    expect(siblingDiscount(25000, 1, 20, 30)).toBe(0);
    expect(siblingDiscount(25000, 2, 20, 30)).toBe(5000);
    expect(siblingDiscount(25000, 4, 20, 30)).toBe(7500);
  });
});

describe("fundraising pot", () => {
  it("deducts event expenses and ignores cancelled movements", () => {
    expect(
      potProgress(100000, [
        { kind: "donation", amount_cents: 30000 },
        { kind: "action", amount_cents: 50000 },
        { kind: "expense", amount_cents: 10000 },
        { kind: "sponsor", amount_cents: 90000, cancelled_at: "2026-10-01" },
      ]),
    ).toEqual({ raised: 80000, spent: 10000, net: 70000, left: 30000, percent: 70, reached: false });
    expect(potProgress(1000, [{ kind: "donation", amount_cents: 1500 }])).toMatchObject({
      percent: 100,
      reached: true,
      left: 0,
    });
  });
});

describe("retention", () => {
  it("counts who stayed, joined and left between seasons", () => {
    expect(
      retention([
        { name: "2024-25", members: ["a", "b", "c", "d"] },
        { name: "2025-26", members: ["a", "b", "c", "e", "f"] },
      ]),
    ).toEqual([
      { season: "2024-25", members: 4, stayed: null, joined: null, left: null, rate: null },
      { season: "2025-26", members: 5, stayed: 3, joined: 2, left: 1, rate: 75 },
    ]);
  });
});

describe("season rollover", () => {
  it("moves dates one year and suggests the next season's name", () => {
    expect(nextYear("2025-09-01")).toBe("2026-09-01");
    expect(nextYear("2024-02-29")).toBe("2025-02-28");
    expect(suggestedName("Saison 2025-26")).toBe("Saison 2026-27");
    expect(suggestedName("2025/2026")).toBe("2026/2027");
    expect(suggestedName("2099-00")).toBe("2100-01");
  });
});

describe("mutual insurance attestation", () => {
  it("needs the season's dues fully paid, cancelled ones aside", () => {
    expect(paidInFull([{ net_cents: 25000, status: "open" }], 25000)).toBe(true);
    expect(paidInFull([{ net_cents: 25000, status: "open" }], 12500)).toBe(false);
    expect(
      paidInFull(
        [
          { net_cents: 25000, status: "open" },
          { net_cents: 5000, status: "cancelled" },
        ],
        25000,
      ),
    ).toBe(true);
    expect(paidInFull([], 0)).toBe(false);
  });
});
