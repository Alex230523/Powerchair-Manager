import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { shellCopy } from "../src/components/shell-copy";

/** Wave 16 (review of 21/10/2026 evening): top bar and account menu. */
const shell = readFileSync("src/components/app-shell.tsx", "utf8"),
  css = readFileSync("src/app/globals.css", "utf8");

describe("B1: no chip under the top bar", () => {
  it("drops the chip, its styles and its text", () => {
    expect(shell).not.toContain("ScopeChip");
    expect(css).not.toMatch(/\.scope-chip|\.scope-clear/);
    for (const l of ["fr", "nl", "en"] as const) expect(shellCopy[l]).not.toHaveProperty("scopeClear");
  });
  it("tints the team capsule when a team is chosen, and the season capsule outside the current season", () => {
    expect(shell).toContain('data-active={scope.teamId ? "" : undefined}');
    expect(shell).toContain("scope.seasonId !== defaultSeasonId(scope.seasons)");
    expect(css).toContain(".capsule[data-active] { background: var(--accent-soft); border-color: var(--primary);");
  });
});
