import { describe, it, expect } from "vitest";
import { byTournamentDay, friendlyCommand, presenceLine, transportState } from "../src/domains/competitions/schema";
import { matchLineCopy } from "../src/components/match-line-copy";

function shape(o: unknown): unknown {
  return o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o;
}
const id = "00000000-0000-4000-8000-000000000001";

/** Wave 17 (C5): friendlies between clubs and the full line of a match. */
describe("wave 17, C5: matches", () => {
  it("says the transport is sorted at home, or with a trip that has a driver", () => {
    expect(transportState({ atHome: true, tripReady: false })).toBe("home");
    expect(transportState({ atHome: false, tripReady: true })).toBe("ready");
    expect(transportState({ atHome: false, tripReady: false })).toBe("todo");
  });
  it("counts who comes out of who is invited, names present first then without answer", () => {
    expect(presenceLine([{ name: "Ana", response: "present" }, { name: "Bilal", response: "none" }, { name: "Chloé", response: "absent" }, { name: "Dina", response: "present" }])).toEqual({
      coming: 2,
      invited: 4,
      names: ["Ana", "Dina"],
      waiting: ["Bilal"],
    });
  });
  it("groups tournament matches by day, in order", () => {
    const m = (id: string, day_id: string, day: string, kickoff: string) => ({ id, day_id, day, label: day_id, tournament: "Coupe", kickoff });
    expect(byTournamentDay([m("c", "d2", "2026-11-20", "10:00"), m("b", "d1", "2026-11-10", "14:00"), m("a", "d1", "2026-11-10", "10:00")]).map((g) => [g.id, g.matches.map((x) => x.id)])).toEqual([
      ["d1", ["a", "b"]],
      ["d2", ["c"]],
    ]);
  });
  it("checks a friendly and its answers", () => {
    const base = { action: "friendly", teamId: id, opponentTeamId: null, opponentName: "Les Loups", home: true, startsAt: "2026-11-14T14:00", placeId: null, venue: "" };
    expect(friendlyCommand.safeParse(base).success).toBe(true);
    expect(friendlyCommand.safeParse({ ...base, startsAt: "14/11/2026" }).success).toBe(false);
    expect(friendlyCommand.safeParse({ action: "answerInvitation", id, accept: false }).success).toBe(true);
    expect(friendlyCommand.safeParse({ action: "organizeTransport", id }).success).toBe(true);
  });
  it("has every text in the three languages, without long dashes", () => {
    expect(shape(matchLineCopy.nl)).toEqual(shape(matchLineCopy.fr));
    expect(shape(matchLineCopy.en)).toEqual(shape(matchLineCopy.fr));
    expect(JSON.stringify(matchLineCopy)).not.toMatch(/[–—]/);
  });
});
