import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fieldsSchema, validateAnswers } from "../src/domains/registrations/schema";
import { platformTemplate } from "../src/domains/registrations/templates";
import { typeLabels } from "../src/components/registrations-copy";
import { maxBadges } from "../src/domains/news/schema";

/** 04/11/2026: sections of a registration form, the to-do as one list, one look for the fields, fewer « Nouveau ». */
describe("sections of a registration form", () => {
  const fields = fieldsSchema.parse(platformTemplate("player", "fr").fields);
  it("groups the player's form in four sections, never answered", () => {
    expect(fields.filter((f) => f.type === "section").map((f) => f.label.fr)).toEqual(["Le joueur", "Coordonnées", "Santé et équipement", "Accords et paiement"]);
    expect(fields.filter((f) => f.type === "section").every((f) => !f.required)).toBe(true);
    // A section asks nothing: an answer given under its key is not kept.
    const section = fields.find((f) => f.type === "section")!;
    const answers = validateAnswers([section], { [section.key]: "x" });
    expect(answers).toEqual({});
  });
  it("names the section type in three languages", () => {
    for (const l of ["fr", "nl", "en"] as const) expect(typeLabels[l].section).toBeTruthy();
  });
});

describe("the screens", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  it("gives every field the same height, border and arrow", () => {
    expect(css).toContain("One look for every field");
    expect(css).toMatch(/select:not\(\.capsule select\) \{[^}]*appearance: none/s);
  });
  it("shows the to-do as one list, the most urgent first, and what is up to date on one line", () => {
    const home = readFileSync("src/components/home.tsx", "utf8");
    expect(home).toContain('className="todo-lines"');
    expect(home).toContain("rank(x) - rank(y) || y.count - x.count");
    expect(home).toContain('className="board-also todo-done"');
  });
  it("keeps at most three « Nouveau » in the menu, gone once the page is opened", () => {
    expect(maxBadges).toBe(3);
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain('action: "seen", route: here');
  });
  it("puts the attendance export on a row of its own, and no stray « Mes équipes » line", () => {
    expect(readFileSync("src/components/attendance.tsx", "utf8")).toContain('<div className="grid-toolbar">');
    expect(readFileSync("src/components/teams.tsx", "utf8")).not.toContain('<Icon name="team" /> {s.teams}');
  });
});
