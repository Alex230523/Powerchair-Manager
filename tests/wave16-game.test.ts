import { describe, it, expect } from "vitest";
import { leaders, outcome, perMatch, playerLines, record, recordsBy } from "../src/domains/statistics/game-math";
import { statisticsCopy } from "../src/components/statistics-copy";

/** Wave 16 (S2): the calculations of the « Jeu » tab. */
const m = (id: string, day: string, our: number, their: number, team = "Lions", opponent = "Gand", kind = "league") => ({ id, starts_at: `${day}T15:00`, team, opponent, kind, our, their });

describe("results", () => {
  it("reads a score as a win, a draw or a loss", () => {
    expect([outcome(3, 1), outcome(2, 2), outcome(0, 1)]).toEqual(["W", "D", "L"]);
  });
  it("adds up a record with the goal difference and the last five results, oldest first", () => {
    const r = record([m("6", "2026-10-06", 1, 0), m("1", "2026-10-01", 3, 1), m("2", "2026-10-02", 2, 2), m("3", "2026-10-03", 0, 1), m("4", "2026-10-04", 1, 1), m("5", "2026-10-05", 0, 4)]);
    expect(r).toEqual({ played: 6, won: 2, drawn: 2, lost: 2, goalsFor: 7, goalsAgainst: 9, difference: -2, winRate: 33, form: ["D", "L", "D", "L", "W"] });
    expect(record([])).toEqual({ played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, difference: 0, winRate: null, form: [] });
  });
  it("groups records by team or opponent, by name", () => {
    expect(recordsBy([m("1", "2026-10-01", 1, 0, "Lions"), m("2", "2026-10-02", 0, 0, "Aigles")], (x) => x.team).map((r) => [r.name, r.won, r.drawn])).toEqual([
      ["Aigles", 0, 1],
      ["Lions", 1, 0],
    ]);
  });
});

describe("players", () => {
  const row = (profile: string, team: string, x: Partial<{ starter: boolean; minutes: number; goals: number; assists: number; yellow_cards: number; red_card: boolean }>) => ({
    profile_id: profile,
    full_name: profile.toUpperCase(),
    team,
    starter: false,
    minutes: 0,
    goals: 0,
    assists: 0,
    yellow_cards: 0,
    red_card: false,
    ...x,
  });
  it("adds up a player's lines across teams", () => {
    const lines = playerLines([row("a", "Lions", { starter: true, minutes: 40, goals: 2, yellow_cards: 1 }), row("a", "Aigles", { minutes: 10, red_card: true }), row("b", "Lions", { assists: 1 })]);
    expect(lines[0]).toEqual({ profile: "a", name: "A", team: "Aigles, Lions", matches: 2, starts: 1, minutes: 50, goals: 2, assists: 0, yellow: 1, red: 1 });
  });
  it("ranks the top ten, ties by name, nobody at zero, with a two-decimal average", () => {
    const lines = playerLines([row("c", "L", { goals: 2 }), row("b", "L", { goals: 2 }), row("b", "L", { goals: 0 }), row("a", "L", {}), row("d", "L", { goals: 1 })]);
    expect(leaders(lines, "goals").map((l) => [l.name, l.total, l.average])).toEqual([
      ["B", 2, 1],
      ["C", 2, 2],
      ["D", 1, 1],
    ]);
    expect(perMatch(5, 3)).toBe(1.67);
    expect(perMatch(1, 0)).toBeNull();
  });
});

describe("texts", () => {
  it("names each outcome with a letter and a word in three languages", () => {
    for (const l of ["fr", "nl", "en"] as const) {
      const g = statisticsCopy[l].game;
      expect(Object.keys(g.outcomes)).toEqual(["W", "D", "L"]);
      expect(new Set(Object.values(g.outcomes)).size).toBe(3);
      expect(Object.values(g.outcomeNames).every((x) => x.length > 2)).toBe(true);
    }
  });
});
