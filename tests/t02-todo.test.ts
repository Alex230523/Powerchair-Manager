import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { nextDue, progressOf, recurrenceText, suggestedTemplates, taskCommand } from "../src/domains/tasks/schema";
import { todoMoreCopy } from "../src/components/todo-more-copy";
import { yearPdfCopy } from "../src/domains/tasks/year-copy";

/** 2: the to-do grows (pure parts). */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]));

describe("to-do", () => {
  it("repeats every week, and says a repetition in words", () => {
    expect(nextDue("2026-11-04", "weekly")).toBe("2026-11-11");
    expect(recurrenceText("fr", "yearly", "2027-06-30")).toBe("Chaque année le 30 juin");
    expect(recurrenceText("fr", "weekly", "2026-11-04", "2026-12-16")).toBe("Chaque semaine le mercredi jusqu'au 16 décembre 2026");
    expect(recurrenceText("en", "monthly", "2026-11-15")).toBe("Every month on the 15");
    expect(recurrenceText("fr", "none", "2026-11-15")).toBe("");
  });
  it("counts the parts done (3/5)", () => {
    expect(progressOf([{ done_on: "2026-11-01" }, { done_on: null }, { done_on: "2026-11-02" }])).toEqual({ done: 2, total: 3 });
  });
  it("accepts several people, a meeting, a place, a link and an amount; refuses a link that is not web", () => {
    const ok = taskCommand.parse({ action: "create", category: "events", title: "Conduire", assignees: ["0b6d3d1e-3c4f-4d58-9a5e-2f7d1c9e8b01"], completion: "each", meetingStartsAt: "2026-11-10T18:00:00+01:00", linkUrl: "https://exemple.be", amountCents: 1000 });
    expect(ok).toMatchObject({ completion: "each", amountCents: 1000 });
    expect(() => taskCommand.parse({ action: "create", category: "events", title: "Conduire", linkUrl: "javascript:alert(1)" })).toThrow();
  });
  it("proposes the five new templates in three languages", () => {
    for (const l of ["fr", "nl", "en"] as const) expect(suggestedTemplates[l].map((t) => t.key)).toEqual(["transport", "training", "tournament", "season", "recruit", "grant", "dinner"]);
    expect(suggestedTemplates.fr.find((t) => t.key === "dinner")!.name).toBe("Souper du club");
  });
  it("speaks three languages", () => {
    for (const copy of [todoMoreCopy, yearPdfCopy] as Record<string, object>[]) {
      expect(keys(copy.nl).sort()).toEqual(keys(copy.fr).sort());
      expect(keys(copy.en).sort()).toEqual(keys(copy.fr).sort());
    }
  });
  it("keeps the old tasks' person and adds without dropping anything", () => {
    const sql = readFileSync("db/migrations/0085_tasks_more.sql", "utf8");
    expect(sql).toContain("INSERT INTO task_assignee(task_id, organization_id, profile_id, done_on)");
    expect(sql).toContain("CREATE TRIGGER task_first_assignee");
    expect(sql).not.toMatch(/DROP (TABLE|COLUMN)/);
  });
});
