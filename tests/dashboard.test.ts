import { describe, expect, it } from "vitest";
import {
  buildTodos,
  formatCents,
  metric,
  metricKeys,
  todoKeys,
} from "../src/domains/dashboard/summary";
import { homeCopy } from "../src/components/home-copy";
import { shellCopy } from "../src/components/shell-copy";
describe("dashboard to-do list", () => {
  it("shows only actionable items and drops resolved causes", () => {
    const todos = buildTodos({
      documentsReview: 2,
      documentsExpired: 0,
      myAttendance: 1,
      registrationsReview: undefined,
    });
    expect(todos.map((t) => t.key)).toEqual([
      "myAttendance",
      "documentsReview",
    ]);
    expect(buildTodos({ documentsReview: 0 })).toEqual([]);
  });
  it("orders the most urgent first and links to the source module", () => {
    const todos = buildTodos({
      documentsMissing: 4,
      registersToClose: 1,
      documentsExpired: 3,
    });
    expect(todos.map((t) => [t.key, t.tone, t.href])).toEqual([
      ["documentsExpired", "danger", "/documents"],
      ["registersToClose", "danger", "/attendance"],
      ["documentsMissing", "info", "/documents"],
    ]);
  });
  it("ignores malformed counts instead of inventing figures", () => {
    expect(
      buildTodos({ documentsReview: Number.NaN, myDocuments: 1.5 }),
    ).toEqual([]);
  });
});
describe("dashboard figures", () => {
  it("defaults to a plain count", () => {
    expect(metric("activeTeams", 3)).toEqual({
      key: "activeTeams",
      value: 3,
      format: "count",
    });
  });
  it("formats euro cents for each language", () => {
    expect(formatCents(6250, "en")).toBe("€62.50");
    expect(formatCents(25000, "fr").replace(/\s/g, " ")).toBe("250,00 €");
  });
});
describe("dashboard and navigation copy", () => {
  it("has the same keys in French, Dutch and English", () => {
    for (const locale of ["nl", "en"] as const) {
      expect(Object.keys(homeCopy[locale]).sort()).toEqual(
        Object.keys(homeCopy.fr).sort(),
      );
      expect(Object.keys(shellCopy[locale]).sort()).toEqual(
        Object.keys(shellCopy.fr).sort(),
      );
      expect(homeCopy[locale].features).toHaveLength(
        homeCopy.fr.features.length,
      );
    }
  });
  it("labels every to-do and figure the service can return", () => {
    for (const locale of ["fr", "nl", "en"] as const) {
      for (const key of todoKeys)
        expect(homeCopy[locale].todos[key].title.length).toBeGreaterThan(0);
      for (const key of metricKeys)
        expect(homeCopy[locale].metrics[key].label.length).toBeGreaterThan(0);
    }
  });
});
