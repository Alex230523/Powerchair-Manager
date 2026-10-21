import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { palettes, tints } from "../src/domains/club/appearance";
import { appearanceCopy } from "../src/components/appearance-copy";

/** Prompt 2.9: the four palettes, measured in both themes, and the clean-up of the former names. */
const css = readFileSync("src/app/globals.css", "utf8");
const lum = (hex: string) => {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
/** The light-dark() pairs of a palette's block. */
function pairs(palette: string) {
  const start = css.indexOf(`  [data-palette="${palette}"] {`);
  const block = css.slice(start, css.indexOf("}", start));
  const read = (token: string) => {
    const m = block.match(new RegExp(`${token}: light-dark\\((#[0-9a-f]{6}), (#[0-9a-f]{6})\\)`));
    if (!m) throw new Error(`${palette} ${token}`);
    return { light: m[1], dark: m[2] };
  };
  return { read };
}

describe("club palettes", () => {
  it("writes each palette in light-dark() and the database knows the same names", () => {
    for (const p of palettes) expect(css).toContain(`[data-palette="${p}"] {`);
    const sql = readFileSync("db/migrations/0041_club_palette.sql", "utf8");
    expect(sql).toContain(palettes.map((p) => `'${p}'`).join(","));
    expect(sql).toContain(tints.map((p) => `'${p}'`).join(","));
  });
  it.each([...palettes])("keeps 4.5:1 for the texts of %s, light and dark", (p) => {
    const { read } = pairs(p);
    const [text, muted, primary, heading, background, soft, surface, onPrimary] = ["--text", "--muted", "--primary", "--heading", "--background", "--surface-soft", "--surface", "--on-primary"].map(read);
    for (const mode of ["light", "dark"] as const) {
      for (const bg of [background, soft, surface]) {
        expect(ratio(text[mode], bg[mode]), `${p} ${mode} text`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(muted[mode], bg[mode]), `${p} ${mode} muted`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(heading[mode], bg[mode]), `${p} ${mode} heading`).toBeGreaterThanOrEqual(4.5);
      }
      expect(ratio(primary[mode], surface[mode]), `${p} ${mode} links`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(onPrimary[mode], primary[mode]), `${p} ${mode} buttons`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("never changes the semantic, team, event and chart colours", () => {
    for (const p of palettes) {
      const start = css.indexOf(`  [data-palette="${p}"] {`);
      const block = css.slice(start, css.indexOf("}", start));
      expect(block).not.toMatch(/--(success|warning|danger|info|chart|team|kind)-/);
    }
  });
  it("has its texts in three languages, without dashes", () => {
    expect(Object.keys(appearanceCopy.nl)).toEqual(Object.keys(appearanceCopy.fr));
    expect(Object.keys(appearanceCopy.en)).toEqual(Object.keys(appearanceCopy.fr));
    expect(JSON.stringify(appearanceCopy)).not.toMatch(/[–—]/);
  });
  it("is set on <html> by the server before the first paint", () => {
    const layout = readFileSync("src/app/[locale]/layout.tsx", "utf8");
    expect(layout).toContain("data-palette=");
    expect(layout).toContain("generateViewport");
    for (const page of ["src/app/[locale]/inscription/[id]/page.tsx", "src/app/[locale]/cagnotte/[token]/page.tsx"]) expect(readFileSync(page, "utf8")).toContain("<ClubPalette");
  });
});

describe("clean-up", () => {
  it("writes no colour outside the tokens, the palettes and the print block", () => {
    const outside = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/:root\s*\{[\s\S]*?\n\}/g, "")
      .replace(/@supports \(color: light-dark[\s\S]*?\n\}/g, "")
      .replace(/\[data-(palette|tint)="[a-z]+"\]\s*\{[\s\S]*?\n\}/g, "");
    const colours = outside.split("\n").filter((l) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(l) && !/^\s*--/.test(l));
    expect(colours).toEqual([]);
  });
  it("keeps the font sizes on the scale", () => {
    expect(css).not.toMatch(/font-size: [0-9.]+(px|rem);/);
  });
});
