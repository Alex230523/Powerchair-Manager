import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { clubTournamentsCopy } from "../src/components/club-tournaments-copy";

/** Wave 16 (E3): the club's own tournaments. */
describe("club tournaments", () => {
  it("has the same texts in three languages, without long dashes, and says the place", () => {
    expect(Object.keys(clubTournamentsCopy.nl).sort()).toEqual(Object.keys(clubTournamentsCopy.fr).sort());
    expect(Object.keys(clubTournamentsCopy.en).sort()).toEqual(Object.keys(clubTournamentsCopy.fr).sort());
    expect(JSON.stringify(clubTournamentsCopy)).not.toMatch(/[–—]/);
    expect(clubTournamentsCopy.fr.rank(2, 8)).toBe("2e sur 8");
    expect(clubTournamentsCopy.fr.rank(1, 8)).toBe("1re sur 8");
    expect(clubTournamentsCopy.en.rank(3, 12)).toBe("3rd of 12");
    expect(clubTournamentsCopy.en.rank(11, 12)).toBe("11th of 12");
  });
  it("prepares a tournament with the calendar's own commands, no new table", () => {
    const ui = readFileSync("src/components/club-tournaments.tsx", "utf8");
    expect(ui).toContain('action: "createTrip"');
    expect(ui).toContain('invite: { ask: true, deadline: null, groups: [{ kind: "team", ref: get("team") }] }');
    expect(readFileSync("src/domains/tournaments/service.ts", "utf8")).toContain("tr.kind='tournament'");
  });
});
