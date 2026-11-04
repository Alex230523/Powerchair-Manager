import { describe, it, expect } from "vitest";
import { menuGroups, type Workspace } from "../src/components/menu";
import { shellCopy } from "../src/components/shell-copy";
import { duesTotals } from "../src/domains/dues/schema";
import { todoKeys } from "../src/domains/dashboard/summary";
import { homeCopy } from "../src/components/home-copy";

/** Wave 14: the president's regrouped menu, the other roles' menus, the shared dues totals. */
const base = (role: Workspace["contexts"][number]["role"], permissions: string[], extra: Partial<Workspace["selected"]> = {}): Workspace => ({
  user: { name: "Alex" },
  contexts: [{ id: "m1", name: "Club", role }],
  profiles: [],
  selected: { id: "m1", organization_id: "o1", organization_name: "Club", kind: "club", logo_version: null, ...extra },
  permissions,
});
const all = ["people.read", "teams.manage", "members.read", "mandates.manage", "registrations.manage", "attendance.manage", "calendar.manage", "calendar.read", "notifications.manage", "dues.read", "dues.manage", "equipment.manage", "documents.manage", "audit.read", "people.manage"];

describe("president menu (wave 14)", () => {
  const groups = menuGroups(base("club_president", all));
  it("has the five groups in order, no Plus (12), and no Mon espace entry", () => {
    expect(groups.map((g) => g.id)).toEqual(["teams", "activities", "communication", "money", "clubGroup"]);
    expect(groups.flatMap((g) => g.items.map((i) => i.route))).not.toContain("/access");
    expect(groups.flatMap((g) => g.items.map((i) => i.route))).not.toContain("/notifications");
  });
  it("places each page where the design says", () => {
    const routes = Object.fromEntries(groups.map((g) => [g.id, g.items.map((i) => i.route)]));
    // Wave 16 (E2): the exercise sheets after the attendance.
    expect(routes.teams).toEqual(["/teams", "/players", "/coaches", "/registrations", "/attendance", "/exercises", "/classification", "/transfers", "/statistics"]);
    expect(routes.activities).toEqual(["/calendar", "/events", "/matches", "/trips", "/venues", "/tournaments"]);
    expect(routes.communication).toEqual(["/communication", "/documents"]);
    // A2: « Subsides & sponsors » has its own entry.
    expect(routes.money).toEqual(["/funding", "/dues", "/funding/grants-sponsors", "/fundraising"]);
    // 12: « Gestion du club » went to Réglages; Réglages is the menu's last entry, apart.
    expect(routes.clubGroup).toEqual(["/club/public", "/club/association", "/equipment", "/discipline", "/contacts", "/tasks", "/circulars"]);
  });
  it("respects switched-off modules and missing rights", () => {
    const off = menuGroups(base("club_president", all, { disabled_modules: ["trips", "equipment", "fundraising"] }));
    const routes = off.flatMap((g) => g.items.map((i) => i.route));
    expect(routes).not.toContain("/trips");
    expect(routes).not.toContain("/equipment");
    expect(routes).not.toContain("/fundraising");
    expect(routes).not.toContain("/offline-book");
    const few = menuGroups(base("club_president", ["people.read"]));
    // Wave 17 (O1): a president always plans the club's tasks.
    expect(few.map((g) => g.id)).toEqual(["teams", "activities", "communication", "clubGroup"]);
  });
  it("labels every group and item in the three languages", () => {
    for (const locale of ["fr", "nl", "en"] as const)
      for (const g of groups) {
        expect(shellCopy[locale][g.label].length).toBeGreaterThan(0);
        for (const i of g.items) expect(shellCopy[locale][i.label].length).toBeGreaterThan(0);
      }
  });
});

describe("other roles keep the wave 10 menu", () => {
  it("a coach sees the modules of their rights (Réglages apart, 12)", () => {
    const groups = menuGroups(base("coach", ["calendar.read", "people.read", "attendance.manage"]));
    expect(groups.map((g) => g.id)).toEqual(["players", "life", "management"]);
    expect(groups.flatMap((g) => g.items.map((i) => i.route))).not.toContain("/access");
  });
  it("a player only has Mon espace (and Réglages, apart, 12)", () => {
    const groups = menuGroups(base("player", []));
    expect(groups.map((g) => g.id)).toEqual(["mine"]);
  });
});

describe("dues totals shared by the page, the dashboard and the sidebar counter", () => {
  const rows = [
    { status: "open", net_cents: 25000, paid_cents: 6250, installments: [{ ordinal: 1, due_on: "2026-09-01", amount_cents: 6250 }, { ordinal: 2, due_on: "2026-10-01", amount_cents: 6250 }, { ordinal: 3, due_on: "2026-11-01", amount_cents: 6250 }, { ordinal: 4, due_on: "2026-12-01", amount_cents: 6250 }] },
    { status: "open", net_cents: 25000, paid_cents: 25000, installments: [{ ordinal: 1, due_on: "2026-09-01", amount_cents: 25000 }] },
    { status: "cancelled", net_cents: 25000, paid_cents: 0, installments: [{ ordinal: 1, due_on: "2026-09-01", amount_cents: 25000 }] },
  ];
  it("counts what is due, collected and late, and the players late", () => {
    expect(duesTotals(rows, "2026-10-20")).toEqual({ due: 50000, collected: 31250, late: 6250, playersLate: 1, rate: 63 });
    expect(duesTotals(rows, "2026-09-15")).toEqual({ due: 50000, collected: 31250, late: 0, playersLate: 0, rate: 63 });
    expect(duesTotals([], "2026-10-20")).toEqual({ due: 0, collected: 0, late: 0, playersLate: 0, rate: null });
  });
  it("has a to-do for late dues with its texts", () => {
    expect(todoKeys).toContain("duesLate");
    for (const locale of ["fr", "nl", "en"] as const) expect(homeCopy[locale].todos.duesLate.title.length).toBeGreaterThan(0);
  });
});

describe("wave 14 texts", () => {
  it("has the same keys in fr, nl and en, without long dashes", () => {
    const shape = (o: object) => Object.keys(o).sort().join(",");
    expect(shape(shellCopy.nl)).toBe(shape(shellCopy.fr));
    expect(shape(shellCopy.en)).toBe(shape(shellCopy.fr));
    expect(JSON.stringify(shellCopy)).not.toMatch(/[–—]/);
  });
});
