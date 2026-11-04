import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { focusCopy } from "../src/components/home-focus-copy";

/** 15: the home by role, each card leading to an action. */
describe("home by role", () => {
  it("has its texts in three languages, without long dashes", () => {
    for (const l of ["nl", "en"] as const) expect(Object.keys(focusCopy[l]).sort()).toEqual(Object.keys(focusCopy.fr).sort());
    expect(JSON.stringify(focusCopy)).not.toMatch(/[–—]/);
  });
  it("computes a focus for players and parents, coaches and the federation only", () => {
    const s = readFileSync("src/domains/dashboard/service.ts", "utf8");
    expect(s).toContain('club && (a.role === "player" || a.role === "guardian")\n      ? await memberFocus(c, org, own)');
    expect(s).toContain('club && a.role === "coach"\n        ? await coachFocus(c, org, own)');
    // 32: the federation's home follows the person's competences.
    expect(s).toContain("!club && fedCan(a.role, a.grants)\n          ? await federationFocus(c, org, {");
  });
  it("answers « Présent / Absent » from the home and keeps lists short", () => {
    const f = readFileSync("src/components/home-focus.tsx", "utf8");
    expect(f).toContain('action: "respond"');
    expect(f).toContain("aria-pressed");
    const focus = readFileSync("src/domains/dashboard/focus.ts", "utf8");
    for (const limit of ["LIMIT 4", "LIMIT 3", "LIMIT 5"]) expect(focus).toContain(limit);
    expect(readFileSync("src/components/home.tsx", "utf8")).toContain("data.todos.slice(0, 5)");
  });
});
