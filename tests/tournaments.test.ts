import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { defaultRules, podium, readRules, standings, tournamentCommand, winner, type MatchResult } from "../src/domains/tournaments/schema";
import { tournamentsCopy } from "../src/components/tournaments-copy";
import { menuGroups } from "../src/components/menu";

/** Tournaments (21/10/2026): tables, podium, rules, texts and menu. */
const clubs = [
  { id: "a", name: "Antwerp", group: "A" },
  { id: "b", name: "Brussels", group: "A" },
  { id: "c", name: "Charleroi", group: "B" },
  { id: "d", name: "Dinant", group: "B" },
];
const m = (home: string, away: string, hs: number | null, as: number | null, extra: Partial<MatchResult> = {}): MatchResult => ({
  stage: "league",
  group: "",
  home,
  away,
  homeScore: hs,
  awayScore: as,
  homeShootout: null,
  awayShootout: null,
  status: hs === null ? "scheduled" : "validated",
  ...extra,
});

describe("standings", () => {
  it("counts points from the rules, validated results only", () => {
    const table = standings(clubs, [m("a", "b", 3, 1), m("c", "d", 2, 2), m("a", "c", 0, 1), m("b", "d", 5, 0, { status: "reported" })], defaultRules);
    expect(table.map((r) => [r.name, r.points, r.played])).toEqual([
      ["Charleroi", 4, 2],
      ["Antwerp", 3, 2],
      ["Dinant", 1, 1],
      ["Brussels", 0, 1],
    ]);
    expect(table[1]).toMatchObject({ won: 1, lost: 1, goalsFor: 3, goalsAgainst: 2, goalDiff: 1 });
  });
  it("uses the chosen tiebreak first: head to head beats goal difference", () => {
    const matches = [m("a", "b", 1, 0), m("a", "c", 0, 5), m("b", "c", 5, 0)];
    expect(standings(clubs.slice(0, 3), matches, { ...defaultRules, tiebreak: "goalDiff" }).map((r) => r.name)).toEqual(["Brussels", "Charleroi", "Antwerp"]);
    // Level on points and goal difference after two legs: Antwerp won the head to head.
    const twoWay = [m("a", "b", 1, 0), m("b", "a", 2, 1)];
    const h2h = standings(clubs.slice(0, 2), twoWay, { ...defaultRules, tiebreak: "headToHead" });
    expect(h2h[0].name).toBe("Antwerp");
  });
  it("limits a table to one group", () => {
    expect(standings(clubs, [m("c", "d", 1, 0, { stage: "group", group: "B" })], defaultRules, "B").map((r) => r.name)).toEqual(["Charleroi", "Dinant"]);
  });
});

describe("podium and winner", () => {
  it("knockout: final then third-place match, shootout when level", () => {
    const final = m("a", "c", 1, 1, { stage: "final", homeShootout: 3, awayShootout: 4 });
    expect(winner(final)).toBe("c");
    expect(podium("knockout", clubs, [final, m("b", "d", 2, 0, { stage: "third" })], defaultRules)).toEqual([
      { rank: 1, club: "c" },
      { rank: 2, club: "a" },
      { rank: 3, club: "b" },
    ]);
    expect(podium("knockout", clubs, [m("a", "c", 1, 1, { stage: "final" })], defaultRules)).toEqual([]);
  });
  it("league: top three of the table, nothing before a result", () => {
    expect(podium("league", clubs, [], defaultRules)).toEqual([]);
    expect(podium("league", clubs, [m("a", "b", 2, 0), m("c", "d", 1, 0)], defaultRules).map((p) => p.club)).toEqual(["a", "c", "d"]);
  });
});

describe("rules and commands", () => {
  it("completes stored rules with the defaults", () => {
    expect(readRules({ win: 2 })).toEqual({ ...defaultRules, win: 2 });
    expect(readRules(null)).toEqual(defaultRules);
    expect(readRules({ win: 99 })).toEqual(defaultRules);
  });
  it("validates commands", () => {
    const id = "4abe9298-004d-4211-91df-104e8db75696";
    expect(tournamentCommand.safeParse({ action: "create", name: "Coupe", year: 2026, format: "knockout", rules: defaultRules, description: "", clubs: [] }).success).toBe(true);
    expect(tournamentCommand.safeParse({ action: "match", id, matchId: null, dayId: id, kickoff: "25:00", stage: "final", group: "", home: id, away: id, refereeId: null }).success).toBe(false);
    expect(tournamentCommand.safeParse({ action: "result", id, matchId: id, version: 1, homeScore: 100, awayScore: 0, homeShootout: null, awayShootout: null, stats: [], validate: false }).success).toBe(false);
  });
});

describe("texts, menu and calendar", () => {
  it("has the same keys in French, Dutch and English, without long dashes", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => k + "." + x) : [k])).sort();
    expect(keys(tournamentsCopy.nl)).toEqual(keys(tournamentsCopy.fr));
    expect(keys(tournamentsCopy.en)).toEqual(keys(tournamentsCopy.fr));
    expect(JSON.stringify(tournamentsCopy)).not.toMatch(/[\u2013\u2014]/);
  });
  it("replaces the federation calendar by Tournaments in every menu", () => {
    const ws = (role: string, kind: "club" | "federation") =>
      ({
        user: { id: "u", name: "U", email: "u@example.test" },
        contexts: [{ id: "m", role, organization_id: "o", name: "Org", kind }],
        selected: { id: "m", role, organization_id: "o", organization_name: "Org", kind, disabled_modules: [] },
        permissions: ["organization.read", "calendar.read"],
      }) as unknown as Parameters<typeof menuGroups>[0];
    for (const [role, kind] of [
      ["club_president", "club"],
      ["coach", "club"],
      ["player", "club"],
      ["federation_president", "federation"],
    ] as const) {
      const routes = menuGroups(ws(role, kind)).flatMap((g) => g.items.map((i) => i.route));
      expect(routes, role).toContain("/tournaments");
      expect(routes, role).not.toContain("/federal-calendar");
    }
    expect(readFileSync("src/app/[locale]/federal-calendar/page.tsx", "utf8")).toContain("redirect(`/${locale}/tournaments`)");
  });
  it("shows the match days in the calendar", () => {
    expect(readFileSync("src/components/calendar.tsx", "utf8")).toContain("useTournamentDays(range.from, range.to)");
  });
});
