import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { bottomNav, type Workspace } from "../src/components/menu";
import { shellCopy } from "../src/components/shell-copy";

/** Wave 15 (C5): the bar at the bottom of a phone screen. */
const ws = (role: string, permissions: string[], disabled: string[] = []): Workspace =>
  ({
    user: { name: "x" },
    contexts: [{ id: "m", name: "Club", role }],
    profiles: [],
    selected: { id: "m", organization_id: "o", organization_name: "Club", kind: "club", logo_version: null, disabled_modules: disabled },
    permissions,
  }) as unknown as Workspace;
const all = ["people.read", "people.manage", "teams.manage", "dues.read", "dues.manage", "attendance.manage", "calendar.manage", "calendar.read", "mandates.manage", "members.read"];
const routes = (w: Workspace) => bottomNav(w).map((i) => i.route);

describe("bottom bar", () => {
  it("follows the role", () => {
    expect(routes(ws("club_president", all))).toEqual(["", "/calendar", "/players", "/dues"]);
    expect(routes(ws("coach", ["attendance.manage", "people.read"]))).toEqual(["", "/calendar", "/attendance", "/players"]);
    expect(routes(ws("player", []))).toEqual(["", "/calendar", "/players", "/dues"]);
    // 27: a parent's first shortcut is « Ma famille ».
    expect(routes(ws("guardian", []))).toEqual(["", "/family", "/calendar", "/dues"]);
  });
  it("keeps to the rights and the modules switched on", () => {
    // 13/11/2026: a coach takes his teams' roll whatever his rights: « Présences » is his.
    expect(routes(ws("coach", ["calendar.read"]))).toEqual(["", "/calendar", "/attendance"]);
    expect(routes(ws("club_president", all, ["dues"]))).toEqual(["", "/calendar", "/players"]);
    expect(routes(ws("player", [], ["dues"]))).toEqual(["", "/calendar", "/players"]);
    expect(bottomNav(null)).toEqual([]);
  });
  it("has its name in three languages and stays off print and wide screens", () => {
    for (const l of ["fr", "nl", "en"] as const) expect(shellCopy[l].bottomNav).toBeTruthy();
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/\.bottom-nav \{\s*display: none;/);
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain('aria-label={t.bottomNav}');
  });
});
