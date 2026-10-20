import { describe, it, expect } from "vitest";
import { defaultSeasonId, resolve } from "../src/domains/scope/resolve";
import { parseScope } from "../src/domains/scope/service";
import { teamsCommand, teamColors } from "../src/domains/teams/service";
import { teamsCopy } from "../src/components/teams-copy";
import { shellCopy } from "../src/components/shell-copy";

const seasons = [
  { id: "11111111-1111-4111-8111-111111111111", archived: false, current: true },
  { id: "22222222-2222-4222-8222-222222222222", archived: false, current: false },
  { id: "33333333-3333-4333-8333-333333333333", archived: true, current: false },
];
const teams = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", season_id: seasons[0].id, archived: false },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", season_id: seasons[0].id, archived: false },
  { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", season_id: seasons[1].id, archived: false },
  { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", season_id: seasons[0].id, archived: true },
];
function shape(o: unknown): unknown {
  if (o && typeof o === "object")
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, shape((o as Record<string, unknown>)[k])]));
  return typeof o;
}

describe("season and team scope", () => {
  it("reads the URL leniently: anything odd becomes no choice", () => {
    expect(parseScope(new URLSearchParams("season=" + seasons[0].id + "&team=" + teams[0].id))).toEqual({ season: seasons[0].id, team: teams[0].id });
    expect(parseScope(new URLSearchParams("season=abc&team="))).toEqual({});
    expect(parseScope({ team: "'; DROP TABLE team" })).toEqual({});
  });
  it("falls back to the current season and all teams on an invalid value", () => {
    expect(resolve(seasons, teams, {})).toEqual({ seasonId: seasons[0].id, teamId: null });
    expect(resolve(seasons, teams, { season: "99999999-9999-4999-8999-999999999999", team: teams[0].id })).toEqual({ seasonId: seasons[0].id, teamId: teams[0].id });
    expect(resolve(seasons, teams, { team: "99999999-9999-4999-8999-999999999999" })).toEqual({ seasonId: seasons[0].id, teamId: null });
  });
  it("keeps a team only inside its season and never an archived one", () => {
    expect(resolve(seasons, teams, { season: seasons[1].id, team: teams[0].id })).toEqual({ seasonId: seasons[1].id, teamId: null });
    expect(resolve(seasons, teams, { season: seasons[1].id, team: teams[2].id })).toEqual({ seasonId: seasons[1].id, teamId: teams[2].id });
    expect(resolve(seasons, teams, { team: teams[3].id })).toEqual({ seasonId: seasons[0].id, teamId: null });
    expect(resolve(seasons, teams, { season: seasons[2].id })).toEqual({ seasonId: seasons[2].id, teamId: null });
  });
  it("picks the current season, else the latest open one", () => {
    expect(defaultSeasonId(seasons)).toBe(seasons[0].id);
    expect(defaultSeasonId([seasons[2], seasons[1]])).toBe(seasons[1].id);
    expect(defaultSeasonId([seasons[2]])).toBe(seasons[2].id);
    expect(defaultSeasonId([])).toBeNull();
  });
  it("offers no team choice to a club with one team (the bar hides the capsule)", () => {
    const one = [teams[0]];
    const chosen = resolve(seasons, one, { team: teams[1].id });
    expect(chosen).toEqual({ seasonId: seasons[0].id, teamId: null });
    expect(one.filter((t) => t.season_id === chosen.seasonId && !t.archived).length <= 1).toBe(true);
  });
});

describe("team identity", () => {
  it("accepts only the palette colours", () => {
    expect(teamColors).toContain("coral");
    const base = { action: "create" as const, seasonId: seasons[0].id, name: "Équipe B", category: "", level: "", homeLocation: "" };
    expect(teamsCommand.safeParse({ ...base, color: "plum" }).success).toBe(true);
    expect(teamsCommand.safeParse({ ...base, color: null }).success).toBe(true);
    expect(teamsCommand.safeParse({ ...base, color: "#ff0000" }).success).toBe(false);
    expect(teamsCommand.safeParse({ ...base, color: "red" }).success).toBe(false);
  });
  it("moves a player with a destination, a date and the keep switch", () => {
    expect(
      teamsCommand.safeParse({ action: "move", profileId: teams[0].id, fromTeamId: teams[0].id, toTeamId: teams[1].id, effectiveOn: "2026-11-01", keep: false }).success,
    ).toBe(true);
    expect(teamsCommand.safeParse({ action: "move", profileId: teams[0].id, fromTeamId: null, toTeamId: teams[1].id, effectiveOn: "1er novembre", keep: false }).success).toBe(false);
  });
});

describe("wave 12 texts", () => {
  it.each([
    ["teams", teamsCopy],
    ["shell", shellCopy],
  ])("%s has the same keys in fr, nl and en", (_name, copy) => {
    const c = copy as Record<string, unknown>;
    expect(shape(c.nl)).toEqual(shape(c.fr));
    expect(shape(c.en)).toEqual(shape(c.fr));
  });
  it("uses no long dashes", () => {
    expect(JSON.stringify([teamsCopy])).not.toMatch(/[–—]/);
  });
});
