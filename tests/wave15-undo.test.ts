import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { undoKinds, undoSeconds } from "../src/domains/undo/service";
import { toastCopy } from "../src/components/toast-copy";

/** Wave 15 (C10): toasts with "Annuler" after a reversible action. */
describe("undo", () => {
  it("knows the same kinds as the database", () => {
    // The latest list of kinds (0048 added eventCancel, wave 16 E1).
    const sql = readFileSync("db/migrations/0048_event_types_invitations.sql", "utf8");
    const listed = sql.match(/undo_action_kind_check CHECK \(kind IN \(([^)]*)\)/)![1].match(/'([a-zA-Z]+)'/g)!.map((s) => s.slice(1, -1));
    expect(listed).toEqual([...undoKinds]);
    // Longer than the 8 seconds on screen, so a hovered message can still be used.
    expect(undoSeconds).toBeGreaterThan(8);
  });
  it("is offered by each reversible action and gone from their confirmations", () => {
    for (const [file, kind] of [
      ["src/domains/people/service.ts", "endAssignment"],
      ["src/domains/teams/service.ts", '"move"'],
      ["src/domains/equipment/service.ts", '"chairRetire"'],
      ["src/domains/messages/service.ts", '"messageHide"'],
      ["src/domains/dues/service.ts", '"payment"'],
    ])
      expect(readFileSync(file, "utf8"), file).toMatch(new RegExp(`offerUndo\\([^)]*${kind}`));
    const people = readFileSync("src/components/people.tsx", "utf8");
    expect(people).not.toContain('confirm("team"');
    expect(people).not.toContain('confirm("season"');
  });
  it("announces the toast politely, pauses it on hover and focus, for 8 seconds", () => {
    const host = readFileSync("src/components/toast.tsx", "utf8"),
      ui = readFileSync("src/components/ui.tsx", "utf8");
    expect(host).toContain('aria-live="polite"');
    expect(host).toContain("const duration = 8000");
    expect(ui).toMatch(/export function Toast[\s\S]*onMouseEnter=\{onPause\}[\s\S]*onFocus=\{onPause\}/);
  });
  it("has every text in three languages, without dashes", () => {
    expect(Object.keys(toastCopy.nl)).toEqual(Object.keys(toastCopy.fr));
    expect(Object.keys(toastCopy.en)).toEqual(Object.keys(toastCopy.fr));
    expect(JSON.stringify(toastCopy)).not.toMatch(/[–—]/);
  });
});
