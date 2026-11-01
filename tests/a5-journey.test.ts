import { describe, it, expect } from "vitest";
import { eligibility, journeyCommand, tally } from "../src/domains/competitions/journey";
import { matchSheetPdf } from "../src/domains/competitions/match-sheet";
import { journeyCopy } from "../src/components/match-journey-copy";
import { todoCopy } from "../src/components/todo-copy";

/** A5: who may play, the live score, the PDF sheet and the texts. */
describe("A5 match journey", () => {
  it("blocks a player without a valid licence or with a broken chair, and warns for the rest", () => {
    expect(eligibility({ licence: "active", documentsDue: 0, chair: { status: "in_use", serviceDue: false } })).toEqual({ blocking: [], warnings: [] });
    expect(eligibility({ licence: "requested", documentsDue: 0, chair: { status: "in_use", serviceDue: false } }).blocking).toEqual(["licence"]);
    expect(eligibility({ licence: null, documentsDue: 2, chair: { status: "maintenance", serviceDue: true } })).toEqual({ blocking: ["licence", "chairBroken"], warnings: ["documents"] });
    expect(eligibility({ licence: "active", documentsDue: 0, chair: { status: "in_use", serviceDue: true } }).warnings).toEqual(["chairService"]);
    expect(eligibility({ licence: "active", documentsDue: 0, chair: null }).warnings).toEqual(["noChair"]);
  });
  it("counts the live score and each player's goals and cards, without cancelled events", () => {
    const t = tally([
      { kind: "goal", profile_id: "a", cancelled_at: null },
      { kind: "goal", profile_id: "a", cancelled_at: "2026-11-01" },
      { kind: "goal", profile_id: "b", cancelled_at: null },
      { kind: "goal_against", profile_id: null, cancelled_at: null },
      { kind: "yellow", profile_id: "a", cancelled_at: null },
      { kind: "yellow", profile_id: "a", cancelled_at: null },
      { kind: "yellow", profile_id: "a", cancelled_at: null },
      { kind: "red", profile_id: "b", cancelled_at: null },
    ]);
    expect([t.ours, t.theirs]).toEqual([2, 1]);
    expect(t.per.get("a")).toEqual({ goals: 1, yellow: 2, red: false });
    expect(t.per.get("b")).toEqual({ goals: 1, yellow: 0, red: true });
  });
  it("refuses a live event without its own id (the offline queue relies on it)", () => {
    expect(() => journeyCommand.parse({ action: "live", id: crypto.randomUUID(), kind: "goal", profileId: null, minute: 3 })).toThrow();
    expect(() => journeyCommand.parse({ action: "live", id: crypto.randomUUID(), clientId: crypto.randomUUID(), kind: "own_goal", profileId: null, minute: 3 })).toThrow();
  });
  it("prints a match sheet with the teams, numbers, classifications, staff, referees and score", () => {
    const pdf = Buffer.from(
      matchSheetPdf({
        club: "Club démo",
        locale: "fr",
        match: { team: "Aigles", opponent: "Lions", home: false, competition: "D1", kind: "league", starts_at: "2026-11-07T13:00:00Z", venue: "Hall de Gand", status: "played", our_score: 2, their_score: 1, validated_at: "2026-11-07T16:00:00Z" },
        lineup: [{ full_name: "Ana Peeters", starter: true, position: "Attaque", jersey_number: 7, classification: "PF1", goals: 2, yellow_cards: 0, red_card: false }],
        staff: [{ full_name: "Sam Coach", role: "coach" }],
        referees: [{ name: "Rita Arbitre", role: "main" }],
        live: [{ kind: "goal", name: "Ana Peeters", minute: 12 }],
      }),
    ).toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    for (const s of ["Lions - Aigles", "Score : Lions 1 - 2 Aigles", "PF1", "Sam Coach", "Rita Arbitre", "Arbitre principal"]) expect(pdf).toContain(s);
  });
  it("has every text in three languages, and the checklist's tasks named in each", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(journeyCopy.nl)).toEqual(keys(journeyCopy.fr));
    expect(keys(journeyCopy.en)).toEqual(keys(journeyCopy.fr));
    for (const l of ["fr", "nl", "en"] as const) {
      expect(JSON.stringify(journeyCopy[l])).not.toMatch(/[–—]/);
      for (const k of ["chairs", "batteries", "balls", "shirts", "firstAid", "transport"]) expect(todoCopy[l].sources[`match_${k}`]).toContain("{about}");
    }
  });
});
