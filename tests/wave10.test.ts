import { describe, it, expect } from "vitest";
import {
  defaultPresenceRules,
  familyOf,
  presenceRules,
  presenceRulesSchema,
  readiness,
} from "../src/domains/dashboard/presence";
import { duesState, settle } from "../src/domains/dues/schema";
import { fillDues, tigerstormTemplate } from "../src/domains/registrations/templates";
import { homeCopy } from "../src/components/home-copy";
import { governanceCopy } from "../src/components/governance-copy";
import { settingsCopy } from "../src/components/settings-copy";
import { shellCopy } from "../src/components/shell-copy";
import { gridCopy } from "../src/components/attendance-grid-copy";

/** Same keys, at every depth, in the three languages. */
function shape(o: unknown): unknown {
  if (o && typeof o === "object")
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, shape((o as Record<string, unknown>)[k])]),
    );
  return typeof o;
}

describe("presence thresholds of the dashboard", () => {
  it("uses the club defaults: 2 coaches and 5 players for green", () => {
    expect(defaultPresenceRules.training.coaches).toEqual({ ok: 2, warn: 1 });
    expect(defaultPresenceRules.training.players).toEqual({ ok: 5, warn: 4 });
    const r = readiness("training", { players: 4, coaches: 2 }, defaultPresenceRules);
    expect(r).toMatchObject({ playersTone: "warn", coachesTone: "ok", tone: "warn" });
    expect(readiness("training", { players: 3, coaches: 0 }, defaultPresenceRules).tone).toBe("low");
    expect(readiness("training", { players: 6, coaches: 3 }, defaultPresenceRules).tone).toBe("ok");
  });
  it("applies the match thresholds to matches, friendlies and tournaments", () => {
    expect(familyOf("match")).toBe("match");
    expect(familyOf("friendly")).toBe("match");
    expect(familyOf("tournament")).toBe("match");
    expect(familyOf("training")).toBe("training");
    expect(familyOf("meeting")).toBe("training");
    const rules = { ...defaultPresenceRules, match: { players: { ok: 8, warn: 6 }, coaches: { ok: 1, warn: 1 } } };
    expect(readiness("match", { players: 6, coaches: 1 }, rules).tone).toBe("warn");
    expect(readiness("training", { players: 6, coaches: 1 }, rules).tone).toBe("warn");
  });
  it("completes partial or invalid stored rules with the defaults", () => {
    expect(presenceRules(null)).toEqual(defaultPresenceRules);
    expect(presenceRules({ match: { players: { ok: 9, warn: 7 }, coaches: { ok: 1, warn: 0 } } }).match.players.ok).toBe(9);
    expect(presenceRules({ training: "oops" })).toEqual(defaultPresenceRules);
    expect(presenceRulesSchema.safeParse({ ...defaultPresenceRules, match: { players: { ok: 2, warn: 4 }, coaches: { ok: 1, warn: 0 } } }).success).toBe(false);
  });
});

describe("dues rows", () => {
  const plan = [
    { ordinal: 1, due_on: "2026-09-01", amount_cents: 10000 },
    { ordinal: 2, due_on: "2026-11-01", amount_cents: 10000 },
    { ordinal: 3, due_on: "2027-01-01", amount_cents: 5000 },
  ];
  it("settles the earliest installments first", () => {
    expect(settle(plan, 15000).map((i) => i.left_cents)).toEqual([0, 5000, 5000]);
    expect(settle(plan, 0).map((i) => i.paid_cents)).toEqual([0, 0, 0]);
    expect(settle(plan, 99999).map((i) => i.left_cents)).toEqual([0, 0, 0]);
  });
  it("names the state of a row: paid, late, due soon, on track", () => {
    const open = { status: "open", net_cents: 25000 };
    expect(duesState(open, settle(plan, 25000), "2026-10-20")).toBe("paid");
    expect(duesState(open, settle(plan, 5000), "2026-10-20")).toBe("late");
    expect(duesState(open, settle(plan, 10000), "2026-10-20")).toBe("due_soon");
    expect(duesState(open, settle(plan, 10000), "2026-10-01")).toBe("on_track");
    expect(duesState({ status: "cancelled", net_cents: 25000 }, [], "2026-10-20")).toBe("cancelled");
    expect(duesState({ status: "open", net_cents: 0 }, [], "2026-10-20")).toBe("exempt");
  });
});

describe("registration form and the dues plan", () => {
  it("writes no amount in the template, only placeholders", () => {
    const text = JSON.stringify(tigerstormTemplate("fr"));
    expect(text).not.toMatch(/250 ?€|€ ?250/);
    expect(text).toContain("{cotisation}");
    expect(text).toContain("{cotisation/4}");
  });
  it("fills the amount of the season, split by installment", () => {
    expect(fillDues("Paiement de la cotisation ({cotisation}) : en combien de fois ?", 25000)).toBe(
      "Paiement de la cotisation (250 €) : en combien de fois ?",
    );
    expect(fillDues(["2 fois ({cotisation/2})", "3 fois ({cotisation/3})"], 25000)).toEqual(["2 fois (125 €)", "3 fois (83,34 €)"]);
    expect(fillDues({ a: { b: "{cotisation} par saison" } }, 18050)).toEqual({ a: { b: "180,50 € par saison" } });
  });
  it("leaves the amount out while the club has no plan", () => {
    expect(fillDues("Membership fee ({cotisation}): how many payments?", null)).toBe("Membership fee: how many payments?");
    expect(fillDues("4 fois ({cotisation/4})", null)).toBe("4 fois");
  });
});

describe("wave 10 texts", () => {
  it.each([
    ["home", homeCopy],
    ["governance", governanceCopy],
    ["settings", settingsCopy],
    ["shell", shellCopy],
    ["attendance grid", gridCopy],
  ])("%s has the same keys in fr, nl and en", (_name, copy) => {
    const c = copy as Record<string, unknown>;
    expect(shape(c.nl)).toEqual(shape(c.fr));
    expect(shape(c.en)).toEqual(shape(c.fr));
  });
  it("uses no long dashes in the visible texts", () => {
    const all = JSON.stringify([homeCopy, governanceCopy, settingsCopy, shellCopy, gridCopy]);
    expect(all).not.toMatch(/[–—]/);
  });
  it("asks to fill attendance rather than to close a register", () => {
    expect(homeCopy.fr.todos.registersToClose.title).toBe("Présences à remplir");
    expect(homeCopy.fr.readiness).toEqual({ ok: expect.any(String), warn: expect.any(String), low: expect.any(String) });
  });
});
