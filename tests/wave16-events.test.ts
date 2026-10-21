import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { commandSchema, inviteGroupKinds } from "../src/domains/calendar/schema";
import { eventCopy } from "../src/components/calendar-event-copy";
import { calendarErrors } from "../src/components/calendar-copy";
import { initialInvite } from "../src/components/event-invite-state";

/** Wave 16 (E1): creating and running an event. */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
describe("event creation", () => {
  it("puts « Nouvel événement » last in the page header, with N as shortcut, and a « + » on each day", () => {
    const page = readFileSync("src/components/calendar.tsx", "utf8");
    const header = page.slice(page.indexOf("<PageHeader"), page.indexOf("/>", page.indexOf("actions={")) + 2);
    expect(header.indexOf("ev.tournaments")).toBeLessThan(header.indexOf("ev.newEvent"));
    expect(page).toContain('aria-keyshortcuts="N"');
    expect(page.match(/p\.newEvent/g) ?? []).toHaveLength(0);
    expect(readFileSync("src/components/calendar-board.tsx", "utf8")).toContain('className="planner-add"');
  });
  it("checks invitation groups: a team, a group or a person names one, an audience does not", () => {
    const base = { action: "previewInvite", teamId: null };
    expect(commandSchema.safeParse({ ...base, invite: { ask: true, deadline: null, groups: [{ kind: "team", ref: null }] } }).success).toBe(false);
    expect(commandSchema.safeParse({ ...base, invite: { ask: true, deadline: null, groups: [{ kind: "players", ref: "00000000-0000-4000-8000-000000000000" }] } }).success).toBe(false);
    expect(commandSchema.safeParse({ ...base, invite: { ask: true, deadline: null, groups: [{ kind: "guardians", ref: null }] } }).success).toBe(true);
    expect(inviteGroupKinds).toContain("group");
  });
  it("starts the form from the saved groups, else the type's defaults", () => {
    const local = (iso: string) => iso.slice(0, 16);
    expect(initialInvite(null, [], null, { ask_response: true, default_groups: ["team", "teamCoaches"] }, null, local)).toEqual({
      ask: true,
      deadline: "",
      groups: [
        { kind: "team", ref: null },
        { kind: "teamCoaches", ref: null },
      ],
    });
    expect(initialInvite([{ kind: "team", ref: "t1" }], [], "t1", null, { deadline: "2026-11-02T17:00:00Z" }, local)).toEqual({ ask: true, deadline: "2026-11-02T17:00", groups: [{ kind: "team", ref: null }] });
    expect(initialInvite([], ["p1"], null, null, null, local).groups).toEqual([{ kind: "person", ref: "p1" }]);
  });
  it("has the same texts in three languages, without long dashes", () => {
    expect(keys(eventCopy.nl)).toEqual(keys(eventCopy.fr));
    expect(keys(eventCopy.en)).toEqual(keys(eventCopy.fr));
    expect(JSON.stringify(eventCopy)).not.toMatch(/[–—]/);
    for (const code of ["EVENT_IN_USE", "TYPE_EXISTS"]) expect(calendarErrors[code]).toHaveLength(3);
  });
  it("proposes nine types to every club, kept in step with the kind", () => {
    const sql = readFileSync("db/migrations/0048_event_types_invitations.sql", "utf8");
    for (const name of ["Entraînement", "Match amical", "Match de championnat", "Tournoi", "Teambuilding", "Réunion administrative", "Assemblée générale", "Stage", "Autre"]) expect(sql).toContain(`('${name}'`);
    expect(sql).toContain("AFTER INSERT ON organization");
    expect(sql).toContain("UPDATE calendar_event e SET event_type_id=");
  });
});
