import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { bulkSummary, eachRow, headerState, nextSort, parseSort, pruneSelection, selectRange, sortParam, sortRows, toCsv } from "../src/components/table-state";
import { bulkSentence, tableCopy } from "../src/components/table-copy";
import { bulkCopy } from "../src/components/bulk-copy";

/** Wave 15 (C8): sorting, selection, grouped actions of the data tables. */
describe("sorting", () => {
  const rows = [
    { name: "Élodie", n: 10, d: "2026-03-01" },
    { name: "adam", n: 2, d: null },
    { name: "Zoé", n: 1, d: "2025-12-31" },
    { name: "Bruno", n: null, d: "2026-01-15" },
  ];
  it("reads and writes the sort of the URL", () => {
    expect(parseSort("name", ["name"])).toEqual({ key: "name", dir: "asc" });
    expect(parseSort("-name", ["name"])).toEqual({ key: "name", dir: "desc" });
    expect(parseSort("-secret", ["name"])).toBeNull();
    expect(sortParam({ key: "age", dir: "desc" })).toBe("-age");
    expect(nextSort(null, "name")).toEqual({ key: "name", dir: "asc" });
    expect(nextSort({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextSort({ key: "name", dir: "desc" }, "age")).toEqual({ key: "age", dir: "asc" });
  });
  it("sorts text with accents and case, numbers as numbers, empty values last", () => {
    expect(sortRows(rows, (r) => r.name, "asc").map((r) => r.name)).toEqual(["adam", "Bruno", "Élodie", "Zoé"]);
    expect(sortRows(rows, (r) => r.n, "asc").map((r) => r.n)).toEqual([1, 2, 10, null]);
    expect(sortRows(rows, (r) => r.n, "desc").map((r) => r.n)).toEqual([10, 2, 1, null]);
    expect(sortRows(rows, (r) => r.d, "desc").map((r) => r.name)).toEqual(["Élodie", "Bruno", "Zoé", "adam"]);
    expect(sortRows(rows, undefined, "asc")).toEqual(rows);
  });
});

describe("selection", () => {
  const order = ["a", "b", "c", "d", "e"];
  it("selects a range with Shift, both ways, and unticks a range", () => {
    expect([...selectRange(new Set(["b"]), order, "b", "d", true)].sort()).toEqual(["b", "c", "d"]);
    expect([...selectRange(new Set(), order, "d", "b", true)].sort()).toEqual(["b", "c", "d"]);
    expect([...selectRange(new Set(order), order, "a", "c", false)].sort()).toEqual(["d", "e"]);
    expect([...selectRange(new Set(), order, null, "c", true)]).toEqual(["c"]);
  });
  it("gives the state of the select-all box", () => {
    expect(headerState(new Set(), order)).toBe("none");
    expect(headerState(new Set(["a"]), order)).toBe("some");
    expect(headerState(new Set(order), order)).toBe("all");
    expect(headerState(new Set(["z"]), order)).toBe("none");
  });
  it("drops the rows that left the list", () => {
    const s = new Set(["a", "z"]);
    expect([...pruneSelection(s, order)]).toEqual(["a"]);
    const same = new Set(["a"]);
    expect(pruneSelection(same, order)).toBe(same);
  });
});

describe("grouped actions", () => {
  it("runs one call per row and keeps each refusal", async () => {
    const results = await eachRow(["a", "b", "c", "d"], (x) => x, async (x) => {
      if (x === "b") throw new Error("FORBIDDEN");
      if (x === "d") throw new Error("ALREADY_PAID");
    });
    expect(results).toEqual([
      { id: "a", ok: true },
      { id: "b", ok: false, code: "FORBIDDEN" },
      { id: "c", ok: true },
      { id: "d", ok: false, code: "ALREADY_PAID" },
    ]);
    const summary = bulkSummary(results);
    expect(summary).toMatchObject({ done: 2, refused: 2 });
    const fr = { ...tableCopy.fr, reasons: { ...tableCopy.fr.reasons, ...bulkCopy.fr.reasons } };
    expect(bulkSentence(fr, "fr", summary)).toBe("2 réussies, 2 refusées : droits insuffisants, paiement déjà reçu");
    expect(bulkSentence(tableCopy.fr, "fr", bulkSummary([{ id: "a", ok: true }, { id: "b", ok: true }, { id: "c", ok: true }, { id: "d", ok: false, code: "FORBIDDEN" }]))).toBe(
      "3 réussies, 1 refusée : droits insuffisants",
    );
    expect(bulkSentence(tableCopy.en, "en", bulkSummary([{ id: "a", ok: false, code: "WHATEVER" }]))).toBe("1 refused: action not possible");
    expect(bulkSentence(tableCopy.nl, "nl", bulkSummary([{ id: "a", ok: true }]))).toBe("1 gelukt");
  });
  it("writes a CSV Excel opens, without formulas", () => {
    const csv = toCsv(["Nom", "Équipe"], [["Zoé; \"Z\"", "=HYPERLINK(1)"], ["Ben", null]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual(["Nom;Équipe", '"Zoé; ""Z""";\'=HYPERLINK(1)', "Ben;"]);
  });
});

describe("texts and use", () => {
  it("has every text in three languages, without dashes", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    for (const c of [tableCopy, bulkCopy]) {
      expect(keys(c.nl)).toEqual(keys(c.fr));
      expect(keys(c.en)).toEqual(keys(c.fr));
      expect(JSON.stringify(c)).not.toMatch(/[–—]/);
    }
  });
  it("is used by the six module lists", () => {
    for (const f of ["player-directory", "people", "registrations", "dues", "documents", "equipment-stock"])
      expect(readFileSync(`src/components/${f}.tsx`, "utf8"), f).toContain("<DataGrid");
  });
  it("puts aria-sort on the sorted header and never styles inline", () => {
    const grid = readFileSync("src/components/data-grid.tsx", "utf8");
    expect(grid).toContain("aria-sort=");
    expect(grid).toContain("indeterminate");
    expect(grid).not.toContain("style={{");
  });
});
