import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { peopleCommand, departureStatuses } from "../src/domains/people/schema";
import { sheetCopy, fillIn } from "../src/components/player-sheet-copy";

function shape(o: unknown): unknown {
  return o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o;
}
const id = "00000000-0000-4000-8000-000000000001";

/** Wave 17 (J1): former players, the single sheet, no age filter. */
describe("wave 17, J1: players", () => {
  it("leaves « Décédé » out of an ordinary departure and asks for it explicitly", () => {
    expect(departureStatuses).toEqual(["stopped", "moved", "unknown", "deceased"]);
    expect(peopleCommand.safeParse({ action: "directoryArchive", id, role: "player", archived: true, departureStatus: "deceased" }).success).toBe(false);
    expect(peopleCommand.safeParse({ action: "directoryArchive", id, role: "player", archived: true, departureStatus: "moved" }).success).toBe(true);
    expect(peopleCommand.parse({ action: "departure", id, status: "deceased" })).toMatchObject({ confirm: false, note: "" });
  });
  it("has the same texts in the three languages", () => {
    expect(shape(sheetCopy.nl)).toEqual(shape(sheetCopy.fr));
    expect(shape(sheetCopy.en)).toEqual(shape(sheetCopy.fr));
    expect(fillIn(sheetCopy.fr.playsAtTeam, { club: "Club B", team: "Aigles" })).toBe("Joue à Club B, Aigles");
    for (const t of Object.values(sheetCopy)) expect(JSON.stringify(t)).not.toMatch(/[–—]/);
  });
  it("drops the minimum age filter and the second « Fiche complète » entry", () => {
    for (const f of ["src/components/player-directory.tsx", "src/components/people.tsx"]) expect(readFileSync(f, "utf8")).not.toMatch(/minAge/);
    expect(readFileSync("src/components/player-directory.tsx", "utf8")).not.toMatch(/Fiche complète|Voir le profil/);
  });
  it("stops every message to a person who has died", () => {
    expect(readFileSync("src/domains/notifications/queue.ts", "utf8")).toContain("deceasedUser");
    expect(readFileSync("src/domains/notifications/eligibility.ts", "utf8")).toContain("deceasedUser");
  });
});
