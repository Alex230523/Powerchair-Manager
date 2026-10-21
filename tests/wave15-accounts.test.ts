import { describe, it, expect } from "vitest";
import { assemblyDeadline, controls, defaultRubric, filingDeadline, fiscalYear, previousYear, statement, type Rubric } from "../src/domains/accounts/schema";
import { categories } from "../src/domains/finance/schema";
import { accountsCopy } from "../src/components/accounts-copy";

/** Wave 15 (C12): financial year bounds, rubric mapping, statement totals, checks, deadlines, texts. */
const keys = (o: object): string[] =>
  Object.entries(o)
    .flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]))
    .sort();
const texts = (o: object): string[] => Object.values(o).flatMap((v) => (v && typeof v === "object" ? texts(v) : [String(v)]));

describe("financial year", () => {
  it("runs from 1 January or from 1 July", () => {
    expect(fiscalYear("01-01", "2026-10-21")).toEqual({ from: "2026-01-01", to: "2026-12-31", label: "2026" });
    expect(fiscalYear("07-01", "2026-10-21")).toEqual({ from: "2026-07-01", to: "2027-06-30", label: "2026-27" });
    expect(fiscalYear("07-01", "2026-06-30")).toEqual({ from: "2025-07-01", to: "2026-06-30", label: "2025-26" });
    expect(previousYear("01-01", "2026-01-01")).toEqual({ from: "2025-01-01", to: "2025-12-31", label: "2025" });
    expect(fiscalYear("01-01", "2028-12-31").to).toBe("2028-12-31");
  });
  it("gives six months for the assembly and thirty days for the filing", () => {
    expect(assemblyDeadline("2025-12-31")).toBe("2026-06-30");
    expect(assemblyDeadline("2026-06-30")).toBe("2026-12-30");
    expect(filingDeadline("2026-05-20")).toBe("2026-06-19");
  });
});

describe("statements", () => {
  it("maps every ledger category to a rubric of the right side", () => {
    for (const c of categories) {
      expect(["dues", "gifts", "subsidies", "goods_in", "other_in"]).toContain(defaultRubric("in", c));
      expect(["goods_out", "wages", "services", "other_out"]).toContain(defaultRubric("out", c));
    }
    expect([defaultRubric("in", "dues"), defaultRubric("in", "sponsor"), defaultRubric("in", "subsidy"), defaultRubric("out", "venue")]).toEqual(["dues", "gifts", "subsidies", "services"]);
  });
  it("totals the rubrics, the club's own mapping first", () => {
    const lines = [
      { direction: "in" as const, category: "dues", amount_cents: 50000, occurred_on: "2026-02-01" },
      { direction: "in" as const, category: "sponsor", amount_cents: 100000, occurred_on: "2026-03-01" },
      { direction: "out" as const, category: "equipment", amount_cents: 30000, occurred_on: "2026-04-01" },
      { direction: "out" as const, category: "venue", amount_cents: 20000, occurred_on: "2026-05-01" },
    ];
    const s = statement(lines, new Map<string, Rubric>([["in:sponsor", "other_in"]]));
    expect(s.income).toMatchObject({ dues: 50000, gifts: 0, other_in: 100000 });
    expect(s.expenses).toMatchObject({ goods_out: 30000, services: 20000 });
    expect([s.totalIn, s.totalOut, s.result]).toEqual([150000, 50000, 100000]);
  });
  it("checks the balance, the categories, the dates and the carried balances", () => {
    expect(controls({ totalIn: 1000, totalOut: 400, opening: 200, closing: 800, outside: 0, uncategorised: 0, previousClosing: null })).toEqual({ balance: "ok", categories: "ok", dates: "ok", carried: "na" });
    expect(controls({ totalIn: 1000, totalOut: 400, opening: 200, closing: 700, outside: 1, uncategorised: 2, previousClosing: 150 })).toEqual({ balance: "fail", categories: "fail", dates: "fail", carried: "fail" });
  });
  it("has the same texts in three languages, without long dashes", () => {
    expect(keys(accountsCopy.nl)).toEqual(keys(accountsCopy.fr));
    expect(keys(accountsCopy.en)).toEqual(keys(accountsCopy.fr));
    for (const l of ["fr", "nl", "en"] as const) for (const t of texts(accountsCopy[l])) expect(t).not.toMatch(/[–—]/);
  });
});
