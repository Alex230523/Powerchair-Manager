import { describe, expect, it } from "vitest";
import { appealOpen, defaultRule, disciplineCommand, nearThreshold, remainingOf, seasonOfDay, yellowTriggers } from "../src/domains/discipline/schema";
import { eligibility } from "../src/domains/competitions/journey";
import { disciplineCopy } from "../src/components/discipline-copy";
import { menuGroups, type Workspace } from "../src/components/menu";

/** 34: the pure parts of the discipline. */
describe("discipline", () => {
  it("sets off a suspension at each completed series of yellows", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => yellowTriggers(n, 3))).toEqual([false, false, true, false, false, true]);
    expect([1, 2, 3].map((n) => nearThreshold(n, 3))).toEqual([false, true, false]);
    expect(nearThreshold(4, 1)).toBe(false);
  });
  it("counts what remains of a suspension and keeps the appeal open until its last day", () => {
    expect([remainingOf(2, 0), remainingOf(2, 1), remainingOf(2, 5)]).toEqual([2, 1, 0]);
    expect(appealOpen("2026-11-09", "2026-11-09")).toBe(true);
    expect(appealOpen("2026-11-09", "2026-11-10")).toBe(false);
    expect(appealOpen(null, "2026-11-01")).toBe(false);
  });
  it("reads the season of a match (1 July)", () => {
    expect(seasonOfDay("2026-06-30")).toBe("2025-26");
    expect(seasonOfDay("2026-07-01")).toBe("2026-27");
  });
  it("blocks a suspended player on the team sheet", () => {
    expect(eligibility({ licence: "active", documentsDue: 0, chair: null, suspended: true }).blocking).toEqual(["suspended"]);
    expect(eligibility({ licence: "active", documentsDue: 0, chair: null }).blocking).toEqual([]);
  });
  it("validates the commands", () => {
    expect(disciplineCommand.safeParse({ action: "rules", season: "2026-27", ...defaultRule }).success).toBe(true);
    expect(disciplineCommand.safeParse({ action: "rules", season: "2026", ...defaultRule }).success).toBe(false);
    expect(disciplineCommand.safeParse({ action: "rules", season: "2026-27", ...defaultRule, kinds: [] }).success).toBe(false);
    expect(disciplineCommand.safeParse({ action: "appeal", sanctionId: "6f1c2f9e-1f6b-4a43-9b8f-3b8f2b8b8b8b", reason: "x" }).success).toBe(false);
  });
  it("opens the pages to the right people", () => {
    const routes = (kind: "club" | "federation", role: Workspace["contexts"][number]["role"], permissions: string[] = []) =>
      menuGroups({
        user: { name: "Alex" },
        contexts: [{ id: "m1", name: "Org", role }],
        profiles: [],
        selected: { id: "m1", organization_id: "o1", organization_name: "Org", kind, logo_version: null },
        permissions,
      })
        .flatMap((g) => g.items)
        .map((i) => i.route);
    expect(routes("federation", "federation_president")).toContain("/federation/discipline");
    expect(routes("federation", "federation_worker", ["federation.referees"])).not.toContain("/federation/discipline");
    expect(routes("federation", "federation_worker", ["federation.discipline"])).toContain("/federation/discipline");
    // 12/11/2026: a club reaches its discipline from the federation's page, out of the menu.
    for (const role of ["club_president", "coach", "player"] as const) {
      expect(routes("club", role)).not.toContain("/discipline");
      expect(routes("club", role)).toContain("/club/federation");
    }
  });
  it("has the same words in the three languages, without the banned vocabulary", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(disciplineCopy.nl)).toEqual(keys(disciplineCopy.fr));
    expect(keys(disciplineCopy.en)).toEqual(keys(disciplineCopy.fr));
    expect(JSON.stringify(disciplineCopy)).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
  });
});
