import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { teamsCommand } from "../src/domains/teams/service";
import { teamsCopy } from "../src/components/teams-copy";
import { todoKeys } from "../src/domains/dashboard/summary";
import { settingsEntries } from "../src/components/settings-nav";

/** Wave 16 (R1): places per team. */
const id = "4abe9298-004d-4211-91df-104e8db75696";
describe("places per team", () => {
  it("accepts an empty limit or 1 to 100", () => {
    const base = { action: "create", seasonId: id, name: "Lions", category: "", level: "", homeLocation: "", color: null };
    expect(teamsCommand.parse(base)).toMatchObject({ capacity: null });
    expect(teamsCommand.safeParse({ ...base, capacity: 10 }).success).toBe(true);
    expect(teamsCommand.safeParse({ ...base, capacity: 0 }).success).toBe(false);
    expect(teamsCommand.safeParse({ ...base, capacity: 101 }).success).toBe(false);
    expect(teamsCommand.safeParse({ action: "capacities", items: [{ id, capacity: null }] }).success).toBe(true);
  });
  it("has its texts in three languages, a setting, a home task and a migration", () => {
    for (const l of ["nl", "en"] as const) expect(Object.keys(teamsCopy[l].places).sort()).toEqual(Object.keys(teamsCopy.fr.places).sort());
    expect(JSON.stringify(teamsCopy)).not.toMatch(/[–—]/);
    expect(settingsEntries.some((e) => e.id === "teamPlaces" && e.category === "activities")).toBe(true);
    expect(todoKeys).toContain("teamsOverCapacity");
    expect(readFileSync("db/migrations/0044_team_capacity.sql", "utf8")).toContain("capacity BETWEEN 1 AND 100");
    expect(readFileSync("src/domains/seasons/rollover.ts", "utf8")).toContain("old.capacity");
  });
});
