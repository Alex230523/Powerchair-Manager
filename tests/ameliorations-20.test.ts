import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { inWindow, marketOpen, bpcfRules } from "../src/domains/transfers/schema";

/** 04/11/2026: the twenty improvements listed after the feedback. */
const read = (f: string) => readFileSync(f, "utf8");
const components = readdirSync("src/components").filter((f) => f.endsWith(".tsx"));

describe("points 1 to 5: corrections", () => {
  it("1: no example written in French inside a component, no long dash", () => {
    for (const f of components) {
      const s = read(`src/components/${f}`);
      expect(s, f).not.toMatch(/placeholder="(Ex\.|Bv\.|E\.g\.)/);
      expect(s, f).not.toMatch(/placeholder="[^"]*[—–]/);
    }
  });
  it("2 and 18: the bubbles are placed against the window and show on a touch screen", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/\.hover-bubble-panel \{[^}]*position: fixed/);
    expect(css).toMatch(/@media \(hover: none\) \{\s*\.hover-bubble-panel/);
    expect(read("src/components/hover-bubble.tsx")).toContain('e.key === "Escape"');
    expect(read("src/components/home.tsx")).toContain("<HoverBubble");
    expect(read("src/components/player-directory.tsx")).toContain("<HoverBubble");
  });
  it("3: a won or lost score has a shape, not only a colour", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain('.match-score[data-outcome="win"] > [aria-hidden]::before');
    expect(css).toContain('.match-score[data-outcome="loss"] > [aria-hidden]::before');
  });
  it("5: yearly transfer periods compare day and month, across the new year", () => {
    expect(inWindow({ from: "2026-07-01", to: "2026-08-31" }, "2031-07-15", true)).toBe(true);
    expect(inWindow({ from: "2026-07-01", to: "2026-08-31" }, "2031-07-15", false)).toBe(false);
    expect(inWindow({ from: "2026-12-20", to: "2027-01-10" }, "2030-01-05", true)).toBe(true);
    expect(inWindow({ from: "2026-12-20", to: "2027-01-10" }, "2030-02-05", true)).toBe(false);
    const r = bpcfRules("2026-11-04", "");
    expect(r.yearlyWindows).toBe(true);
    expect(marketOpen(r, "2029-08-01")).toBe(true);
    expect(marketOpen(r, "2029-10-01")).toBe(false);
  });
});
