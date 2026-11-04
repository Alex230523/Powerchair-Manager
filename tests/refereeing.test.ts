import { describe, expect, it } from "vitest";
import { expenseAmount, refereeingCommand, reviewOpen, routeLinks, warnings } from "../src/domains/referees/schema";
import { refereeingCopy } from "../src/components/refereeing-copy";

/** 25 and 36 to 39: the pure parts of the refereeing circuit. */
describe("refereeing", () => {
  it("warns about a day off, a club of the match and a referee already busy", () => {
    const match = { day: "2026-11-14", startsAt: "2026-11-14T13:00:00.000Z", clubs: ["a", "b"] };
    expect(warnings(match, { clubs: [], unavailable: [], busy: [] })).toEqual([]);
    expect(warnings(match, { clubs: ["b"], unavailable: ["2026-11-14"], busy: ["2026-11-14T14:00:00.000Z"] })).toEqual(["unavailable", "club", "busy"]);
    // Two hours apart: free.
    expect(warnings(match, { clubs: [], unavailable: [], busy: ["2026-11-14T15:00:00.000Z"] })).toEqual([]);
  });
  it("prices a claim with the federation's rates", () => {
    expect(expenseAmount(1000, 30, 20, 500)).toBe(2100);
    expect(expenseAmount(0, 25, 12.5, 0)).toBe(313);
  });
  it("gives the routes of a place, and none without a place", () => {
    const r = routeLinks("Hall de Namur");
    expect(r?.google).toBe("https://www.google.com/maps/search/?api=1&query=Hall%20de%20Namur");
    expect(r?.waze).toBe("https://waze.com/ul?q=Hall%20de%20Namur&navigate=yes");
    expect(routeLinks("  ")).toBeNull();
  });
  it("keeps the review open 48 hours", () => {
    const sent = new Date("2026-11-01T10:00:00Z");
    expect(reviewOpen(sent, new Date("2026-11-03T09:59:00Z"))).toBe(true);
    expect(reviewOpen(sent, new Date("2026-11-03T10:01:00Z"))).toBe(false);
  });
  it("validates the commands", () => {
    const id = "6f1c2f9e-1f6b-4a43-9b8f-3b8f2b8b8b8b";
    expect(refereeingCommand.safeParse({ action: "designate", target: { kind: "tournament", id }, refereeId: "u", role: "main" }).success).toBe(true);
    expect(refereeingCommand.safeParse({ action: "designate", target: { kind: "friendly", id }, refereeId: "u", role: "main" }).success).toBe(false);
    expect(refereeingCommand.safeParse({ action: "settings", levels: [], flatCents: 0, kmRateCents: 0 }).success).toBe(false);
    expect(refereeingCommand.safeParse({ action: "report", matchId: id, homeScore: 1, awayScore: 0, events: [{ kind: "goal", side: "home", player: "", profileId: id, minute: 3 }] }).success).toBe(true);
  });
  it("has the same words in the three languages, without the banned vocabulary", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(refereeingCopy.nl)).toEqual(keys(refereeingCopy.fr));
    expect(keys(refereeingCopy.en)).toEqual(keys(refereeingCopy.fr));
    expect(keys(refereeingCopy.nl.errors)).toEqual(keys(refereeingCopy.fr.errors));
    expect(JSON.stringify(refereeingCopy)).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
  });
});
