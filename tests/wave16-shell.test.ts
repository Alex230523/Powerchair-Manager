import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { languageNames, shellCopy } from "../src/components/shell-copy";

/** Wave 16 (review of 21/10/2026 evening): top bar and account menu. */
const shell = readFileSync("src/components/app-shell.tsx", "utf8"),
  css = readFileSync("src/app/globals.css", "utf8");

describe("B1: no chip under the top bar", () => {
  it("drops the chip, its styles and its text", () => {
    expect(shell).not.toContain("ScopeChip");
    expect(css).not.toMatch(/\.scope-chip|\.scope-clear/);
    for (const l of ["fr", "nl", "en"] as const) expect(shellCopy[l]).not.toHaveProperty("scopeClear");
  });
  it("tints the season capsule outside the current season; no team capsule (12/11/2026)", () => {
    expect(shell).not.toContain('data-active={scope.teamId ? "" : undefined}');
    expect(shell).not.toContain("scope.setTeam(");
    expect(shell).toContain("scope.seasonId !== defaultSeasonId(scope.seasons)");
    expect(css).toContain(".capsule[data-active] { background: var(--accent-soft); border-color: var(--primary);");
  });
});

describe("M1: a compact account menu", () => {
  it("keeps the menu inside the sidebar", () => {
    expect(css).toMatch(/\.profile-menu-body \{[^}]*max-width: 240px;/);
    expect(css).toMatch(/\.small-check input\[type="checkbox"\],\n\.profile-menu-body \.small-check input\[type="checkbox"\] \{\n  width: 18px;\n  height: 18px;/);
  });
  it("orders the menu: account, settings, language, theme, text size, contrast, sign out; no « Mon espace »", () => {
    const body = shell.slice(shell.indexOf('<div className="profile-menu-body">'), shell.indexOf("{error && <p role=\"alert\">{error}</p>}"));
    const order = ["t.changeProfile", "t.myAccount", "t.settings", "<LanguageChoice", "<ThemeChoice", "<TextSizeChoice", "<ContrastChoice", "t.signOut"].map((k) => body.indexOf(k));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(body).not.toContain("/access`");
  });
  it("names the theme icons and the languages in each language", () => {
    for (const l of ["fr", "nl", "en"] as const) {
      expect(shellCopy[l].themeLightName).toBeTruthy();
      expect(shellCopy[l].themeDarkName).toBeTruthy();
    }
    expect(languageNames).toEqual({ fr: "Français", nl: "Nederlands", en: "English" });
    expect(shell).toContain("aria-label={t.themeLightName} title={t.themeLightName}");
  });
});
