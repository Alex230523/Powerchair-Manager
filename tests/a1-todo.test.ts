import { describe, it, expect } from "vitest";
import { categories, clubCategories, federationCategories, groupTasks, isLate, nextDue, taskCommand, thisWeek, yearItems, yearTemplate } from "../src/domains/tasks/schema";
import { sourceKinds } from "../src/domains/tasks/sources";
import { todoCopy, fill } from "../src/components/todo-copy";
import { paletteActions } from "../src/components/palette";

/** A1: the central to-do, its pure rules and its texts. */
describe("A1 to-do", () => {
  it("keeps every category, empty ones included, sorted by due date then priority", () => {
    const tasks = [
      { category: "grants" as const, due_on: null, title: "B", priority: "normal" },
      { category: "grants" as const, due_on: "2026-11-02", title: "C", priority: "normal" },
      { category: "grants" as const, due_on: "2026-11-02", title: "D", priority: "high" },
    ];
    const groups = groupTasks(tasks);
    expect(groups.map((g) => g.category)).toEqual([...clubCategories]);
    expect(groups.find((g) => g.category === "grants")!.tasks.map((t) => t.title)).toEqual(["D", "C", "B"]);
    expect(groupTasks([], true).map((g) => g.category)).toEqual([...federationCategories]);
  });
  it("brings a recurring task to the right next date", () => {
    expect(nextDue("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextDue("2026-12-15", "monthly")).toBe("2027-01-15");
    expect(nextDue("2028-02-29", "yearly")).toBe("2029-02-28");
    expect(nextDue("2026-03-01", "none")).toBeNull();
  });
  it("dates the yearly duties of an ASBL from its financial year", () => {
    const calendar = yearTemplate("01-01", 2026);
    expect(calendar.map((i) => i.key)).toEqual([...yearItems]);
    expect(calendar.find((i) => i.key === "assembly")!.dueOn).toBe("2026-06-30");
    expect(calendar.find((i) => i.key === "filing")!.dueOn).toBe("2026-07-30");
    // A season year from 1 July: closed on 30 June, assembly six months later.
    expect(yearTemplate("07-01", 2026).find((i) => i.key === "assembly")!.dueOn).toBe("2026-12-30");
  });
  it("tells late tasks and this week's", () => {
    expect(isLate({ status: "todo", due_on: "2026-10-21" }, "2026-10-22")).toBe(true);
    expect(isLate({ status: "done", due_on: "2026-10-21" }, "2026-10-22")).toBe(false);
    expect(thisWeek({ status: "doing", due_on: "2026-10-28" }, "2026-10-22")).toBe(true);
    expect(thisWeek({ status: "todo", due_on: "2026-10-29" }, "2026-10-22")).toBe(false);
  });
  it("reads a task by category, with its defaults", () => {
    const c = taskCommand.parse({ action: "create", category: "fundraising", title: "Vente de gaufres" });
    expect(c).toMatchObject({ category: "fundraising", priority: "normal", recurrence: "none", checklist: [], dueOn: null });
    expect(() => taskCommand.parse({ action: "status", id: "00000000-0000-4000-8000-000000000000", status: "later" })).toThrow();
  });
  it("offers « Ajouter une tâche » in Ctrl+K to those who plan", () => {
    const base = { kind: "club" as const, disabled: [], seasons: 1, teams: 1 };
    expect(paletteActions({ ...base, role: "club_president", permissions: [] }).map((a) => a.id)).toContain("addTask");
    expect(paletteActions({ ...base, role: "player", permissions: [] }).map((a) => a.id)).not.toContain("addTask");
  });
  it("has every text in three languages, without dashes", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    expect(keys(todoCopy.nl)).toEqual(keys(todoCopy.fr));
    expect(keys(todoCopy.en)).toEqual(keys(todoCopy.fr));
    for (const l of ["fr", "nl", "en"] as const) {
      expect(Object.keys(todoCopy[l].categories).sort()).toEqual([...categories].sort());
      for (const k of sourceKinds) expect(todoCopy[l].sources[k]).toContain("{about}");
      expect(JSON.stringify(todoCopy[l])).not.toMatch(/[–—]/);
    }
    expect(fill(todoCopy.fr.sources.chairService, { about: "Fauteuil 3" })).toBe("Réviser le fauteuil Fauteuil 3");
  });
});
