import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/** Wave 13, foundations: the tokens of the new design system, written once for both themes. */
const css = readFileSync("src/app/globals.css", "utf8");
const root = css.slice(css.indexOf(":root"), css.indexOf("/* ---------- Base ---------- */"));

describe("design tokens", () => {
  it.each([
    "--primary", "--primary-hover", "--on-primary", "--heading", "--text", "--muted", "--background", "--surface", "--surface-soft",
    "--accent-soft", "--border", "--border-strong", "--grid-line", "--focus",
    "--success", "--success-soft", "--success-ink", "--warning", "--warning-soft", "--warning-ink", "--danger", "--danger-soft", "--danger-ink", "--info", "--info-soft", "--info-ink",
    "--chart-1", "--chart-8", "--radius-xs", "--radius-sm", "--radius-md", "--radius-card", "--radius-pill",
    "--shadow-card", "--shadow-hover", "--shadow-pop", "--space-1", "--space-12", "--text-xs", "--text-2xl",
    "--sidebar-width", "--topbar-height", "--content-padding", "--card-padding", "--card-gap", "--transition", "--font-ui", "--font-display", "--logo-accent",
  ])("defines %s", (token) => {
    expect(root).toMatch(new RegExp(`${token}:`));
  });
  it("writes each colour once for both themes, with light-dark()", () => {
    expect(root).toMatch(/--primary: light-dark\(#213c60, #8fb3e0\)/);
    expect(root).toMatch(/--background: light-dark\(#f9fbfe, #10151c\)/);
    // The two theme switches only flip color-scheme: no second copy of the palette.
    expect(css.match(/prefers-color-scheme: dark/g)?.length).toBe(1);
    expect(css.match(/:root\[data-theme="dark"\]/g)?.length).toBe(1);
  });
  it("has no alias of the former names any more (prompt 2.9)", () => {
    for (const old of ["--ink", "--line", "--line-strong", "--bg", "--surface-2", "--surface-3", "--accent", "--accent-hover", "--accent-solid", "--accent-ink", "--on-accent", "--brand-500", "--radius", "--radius-lg", "--shadow-sm", "--shadow", "--font"]) {
      expect(css, old).not.toMatch(new RegExp(`${old}:\\s`));
      expect(css, old).not.toMatch(new RegExp(`var\\(${old}[,)]`));
    }
  });
  it("leaves orange to the logo only", () => {
    const oranges = css.split("\n").filter((l) => /#f97316|#fb923c|#fa6f1d|#c2410c|#ea580c|249 115 22|251 146 60/i.test(l));
    expect(oranges.every((l) => l.includes("--logo-accent"))).toBe(true);
    expect(readFileSync("src/components/icons.tsx", "utf8")).not.toContain("#fa6f1d");
    expect(readFileSync("src/components/icons.tsx", "utf8")).toContain("var(--logo-accent");
  });
  it("sets the text scale with nothing below 12 px", () => {
    // In rem since wave 15 (C4), 1rem = 16px at the normal text size.
    const sizes = [...root.matchAll(/--text-[a-z0-9]+: ([\d.]+)rem/g)].map((m) => Number(m[1]) * 16);
    expect(sizes.length).toBe(7);
    expect(Math.min(...sizes)).toBe(12);
    expect(root).toMatch(/--text-base: 0\.875rem/);
  });
  it("uses the serif for h1 and h2, the sans for h3, and drops the bar before card titles", () => {
    expect(css).toMatch(/h1 \{[^}]*font-family: var\(--font-display\)[^}]*font-size: var\(--text-2xl\)[^}]*font-weight: 700/s);
    expect(css).toMatch(/h2 \{[^}]*font-family: var\(--font-display\)[^}]*font-size: var\(--text-lg\)/s);
    expect(css).toMatch(/h3 \{[^}]*font-family: var\(--font-ui\)[^}]*font-size: var\(--text-md\)[^}]*font-weight: 600/s);
    expect(css).not.toContain(".panel > h2::before");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
  it("serves the fonts itself", () => {
    const fonts = readFileSync("src/app/fonts.ts", "utf8");
    expect(fonts).toContain('from "next/font/google"');
    expect(fonts).toContain('variable: "--font-dm-sans"');
    expect(fonts).toContain('variable: "--font-source-serif"');
    expect(css).not.toMatch(/fonts\.googleapis\.com|@import/);
    for (const layout of ["src/app/[locale]/layout.tsx", "src/app/(entry)/layout.tsx"]) expect(readFileSync(layout, "utf8")).toContain("className={fontClass}");
  });
});
