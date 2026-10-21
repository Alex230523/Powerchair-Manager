import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { budgetTone } from "../src/domains/finance/schema";
import { collectionFigures, duesTotals } from "../src/domains/dues/schema";
import { collectionCopy } from "../src/components/collection-copy";

/** Wave 15 (2.8): budget colours, the shared collection figures, no inline style. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("budget", () => {
  it("colours spending under 90 %, up to 100 % and beyond, never alarms on income", () => {
    expect([budgetTone("out", 45), budgetTone("out", 89), budgetTone("out", 90), budgetTone("out", 100), budgetTone("out", 101)]).toEqual(["success", "success", "warning", "warning", "danger"]);
    expect([budgetTone("in", 50), budgetTone("in", 100), budgetTone("in", 140), budgetTone("out", null)]).toEqual(["neutral", "success", "success", "neutral"]);
  });
});

describe("collection bar", () => {
  it("gives the rate, what is collected, what is left and the late part", () => {
    expect(collectionFigures({ due: 100000, collected: 62000, late: 12500 })).toEqual({ rate: 62, collected: 62000, remaining: 38000, late: 12500 });
    expect(collectionFigures({ due: 0, collected: 0, late: 0 }).rate).toBeNull();
    expect(collectionFigures({ due: 1000, collected: 1200, late: 0 }).remaining).toBe(0);
  });
  it("reads the same totals as the home (duesTotals)", () => {
    const debts = [
      { status: "open", net_cents: 25000, paid_cents: 6250, installments: [1, 2, 3, 4].map((i) => ({ ordinal: i, due_on: `2026-0${i + 5}-01`, amount_cents: 6250 })) },
      { status: "open", net_cents: 10000, paid_cents: 10000, installments: [{ ordinal: 1, due_on: "2026-09-01", amount_cents: 10000 }] },
    ];
    const totals = duesTotals(debts, "2026-10-21");
    expect(collectionFigures(totals)).toEqual({ rate: Math.round((16250 / 35000) * 100), collected: 16250, remaining: 18750, late: 18750 });
  });
  it("has the same texts in three languages, without long dashes", () => {
    for (const l of ["nl", "en"] as const) expect(Object.keys(collectionCopy[l]).sort()).toEqual(Object.keys(collectionCopy.fr).sort());
    for (const l of ["fr", "nl", "en"] as const) for (const t of Object.values(collectionCopy[l])) expect(t).not.toMatch(/[–—]/);
  });
});

describe("styles", () => {
  it("passes values to the stylesheet through CSS variables only, never an inline style object", () => {
    const offenders = files("src").filter((f) => readFileSync(f, "utf8").includes("style={{"));
    expect(offenders).toEqual([]);
  });
});
