import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { exerciseCommand } from "../src/domains/exercises/schema";
import { exercisesCopy } from "../src/components/exercises-copy";
import { menuGroups, type Workspace } from "../src/components/menu";
import { shellCopy } from "../src/components/shell-copy";

/** Wave 16 (E2): exercise sheets. */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
const club = (role: Workspace["contexts"][number]["role"], permissions: string[]): Workspace => ({
  user: { name: "Alex" },
  contexts: [{ id: "m1", name: "Club", role }],
  profiles: [],
  selected: { id: "m1", organization_id: "o1", organization_name: "Club", kind: "club", logo_version: null },
  permissions,
});
describe("exercise sheets", () => {
  it("validates a sheet: duration, players, video in https", () => {
    const base = {
      action: "create",
      title: "Slalom",
      objective: "driving",
      description: "",
      safety: "",
      durationMinutes: 15,
      playersMin: 2,
      playersMax: 6,
      level: "beginner",
      suited: "both",
      equipment: "",
      variants: "",
      videoUrl: "",
      tags: [],
      shared: true,
    };
    expect(exerciseCommand.safeParse(base).success).toBe(true);
    expect(exerciseCommand.safeParse({ ...base, durationMinutes: 0 }).success).toBe(false);
    expect(exerciseCommand.safeParse({ ...base, videoUrl: "http://exemple.be" }).success).toBe(false);
    expect(exerciseCommand.safeParse({ ...base, suited: "PF3" }).success).toBe(false);
  });
  it("is in the menu of the president and of the coaches", () => {
    const routes = (w: Workspace) => menuGroups(w).flatMap((g) => g.items.map((i) => i.route));
    expect(routes(club("club_president", ["people.read", "calendar.manage"]))).toContain("/exercises");
    expect(routes(club("coach", []))).toContain("/exercises");
    expect(routes(club("player", []))).not.toContain("/exercises");
    for (const l of ["fr", "nl", "en"] as const) expect(shellCopy[l].exercises).toBeTruthy();
  });
  it("has the same texts in three languages, without long dashes", () => {
    expect(keys(exercisesCopy.nl)).toEqual(keys(exercisesCopy.fr));
    expect(keys(exercisesCopy.en)).toEqual(keys(exercisesCopy.fr));
    expect(JSON.stringify(exercisesCopy)).not.toMatch(/[–—]/);
  });
  it("prints on A4, one sheet per page, without the menus", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("size: A4;");
    expect(css).toContain(".program-print > li + li {\n    break-before: page;");
  });
});
