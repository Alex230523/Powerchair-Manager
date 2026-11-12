import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { presets, presetKeys } from "../src/domains/tasks/presets";
import { sourceKinds } from "../src/domains/tasks/sources";
import { taskCommand, clubCategories } from "../src/domains/tasks/schema";
import { todoCopy } from "../src/components/todo-copy";
import { boardCopy } from "../src/components/task-board-copy";

/**
 * 12/11/2026, the task board: the ready-made lists in three languages, the
 * application's tasks titled in each, the commands of the board, and the
 * drop line drawn for the tasks and the registration form's questions.
 */
const read = (f: string) => readFileSync(f, "utf8");
const keys = (o: object) => Object.keys(o).sort();

describe("task board", () => {
  it("offers ready-made lists, complete in three languages, never with banned words", () => {
    expect(presetKeys).toEqual(["matchHome", "matchAway", "assembly", "openDay", "fundraising"]);
    for (const p of presets) {
      expect((clubCategories as readonly string[]).includes(p.category), p.key).toBe(true);
      for (const l of ["fr", "nl", "en"] as const) {
        expect(p.name[l].length, p.key).toBeGreaterThan(2);
        for (const i of p.items) expect(i.title[l].length, `${p.key} ${l}`).toBeGreaterThan(2);
      }
      expect(p.items.length).toBeLessThanOrEqual(30);
    }
    expect(JSON.stringify(presets)).not.toMatch(/convoqu|opgeroep|summon|call-up|[\u2013\u2014]/i);
  });

  it("titles every task the application makes, in the three languages", () => {
    for (const k of sourceKinds) for (const l of ["fr", "nl", "en"] as const) expect(todoCopy[l].sources[k], `${k} ${l}`).toBeTruthy();
    expect(keys(boardCopy.nl)).toEqual(keys(boardCopy.fr));
    expect(keys(boardCopy.en)).toEqual(keys(boardCopy.fr));
    expect(JSON.stringify(boardCopy)).not.toMatch(/[\u2013\u2014]/);
  });

  it("accepts the board's commands, and only well-formed groups", () => {
    const id = "6f0c1c9e-8a43-4c8e-9a39-0a3d6f1c0b11";
    expect(taskCommand.safeParse({ action: "reorder", group: "cat:equipment", ids: [id] }).success).toBe(true);
    expect(taskCommand.safeParse({ action: "reorder", group: `list:${id}`, ids: [id] }).success).toBe(true);
    expect(taskCommand.safeParse({ action: "reorder", group: "cat:Equip;drop", ids: [id] }).success).toBe(false);
    expect(taskCommand.safeParse({ action: "reorder", group: "cat:equipment", ids: [] }).success).toBe(false);
    expect(taskCommand.safeParse({ action: "materials", id, items: Array(31).fill("x") }).success).toBe(false);
    expect(taskCommand.safeParse({ action: "saveList", name: "B" }).success).toBe(false);
    expect(taskCommand.safeParse({ action: "fromPreset", preset: "matchHome", date: "2026-12-01" }).success).toBe(true);
  });

  it("draws the drop line, keeps a way to move without a mouse, and tells every person given a task", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/ul\.task-board > li\.task-row\[data-drop\]::before \{[^}]*background: var\(--primary\)/);
    expect(css).toMatch(/fieldset\.question-card\[data-drop\]::after \{[^}]*background: var\(--primary\)/);
    const ui = read("src/components/tasks.tsx");
    expect(ui).toContain('if (e.key === "ArrowUp" && board.up)');
    expect(ui).toContain("{bc.moveUp}");
    expect(read("src/domains/jobs/registry.ts")).toContain("taskAssignees: await tellAssignedTick(db)");
    expect(read("db/migrations/0147_task_board.sql")).toContain("UPDATE task_assignee SET told_at = created_at WHERE told_at IS NULL;");
  });
});
