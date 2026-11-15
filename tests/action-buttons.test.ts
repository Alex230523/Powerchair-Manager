import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * 12/11/2026: a way onward (« Ouvrir le calendrier », « Voir tout »,
 * « Retour », a team card's Effectif, Calendrier, Présences) is a button,
 * like « Ouvrir les finances », not an underlined text. Links stay links
 * inside a sentence, for a name in a list or a table, and for an address
 * shown as it is.
 */
const files = readdirSync("src/components", { recursive: true })
  .map(String)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => ["src/components/" + f, readFileSync("src/components/" + f, "utf8")] as const);
const link = String.raw`<(Link|a)\b((?:(?!<).)*?)>\s*((?:\{[^{}]*\}|[^<{}]*))\s*(?:<span[^>]*>[^<]*(?:\{[^{}]*\})?[^<]*</span>\s*)?</\1>`;
/** Alone in a paragraph but not a way onward: the address shown, a name, the sign-in page's question. */
const allowed = ["{w.link}", "{x.video_url}", "{p.next.title}", "{x.tournament}", "{t.noAccount}"];

describe("ways onward are buttons", () => {
  it("never leaves a link alone in a paragraph as underlined text", () => {
    const loose: string[] = [];
    for (const [f, s] of files)
      for (const m of s.matchAll(new RegExp(String.raw`<p(?: className="[^"]*")?>\s*` + link + String.raw`\s*</p>`, "gs")))
        if (!/className="button/.test(m[2]) && !allowed.includes(m[3].trim())) loose.push(`${f}: ${m[3].trim().slice(0, 60)}`);
    expect(loose).toEqual([]);
  });
  it("puts a button in a card's header, and in a team card's foot", () => {
    for (const [f, s] of files) expect(s.match(/actions=\{\s*\(?\s*<(Link|a)\b(?![^>]*className="button)/g) ?? [], f).toEqual([]);
    const teams = readFileSync("src/components/teams.tsx", "utf8");
    const foot = teams.slice(teams.indexOf('<div className="team-card-foot">'), teams.indexOf("</div>", teams.indexOf('<div className="team-card-foot">')));
    expect(foot.match(/<Link className="button secondary"/g)).toHaveLength(3);
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/\.card-link-row \.button \{\s*width: 100%;/);
    expect(css).not.toMatch(/\.team-card-foot a \{/);
  });
  // 13/11/2026: the actions of a row (Modifier, Retirer, Monter…) are small buttons too.
  it("draws a row's actions as small bordered buttons, a name that opens its sheet as a name", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const rule = css.match(/\n\.text-button \{([^}]*)\}/)![1];
    expect(rule).toMatch(/border: 1px solid var\(--border-strong\);/);
    expect(rule).toMatch(/text-decoration: none;/);
    expect(rule).not.toMatch(/underline/);
    expect(css).toMatch(/\.text-button\.name-link \{[^}]*background: none;/);
    // A name-link holds a name or a title, never an action word of the copy (t.edit, t.remove…).
    for (const [f, s] of files)
      for (const m of s.matchAll(/className="text-button name-link[^"]*"[^>]*>\s*([^<]*)/g)) expect(m[1].trim(), f).not.toMatch(/^\{\w+\.(edit|remove|delete|cancel|withdraw|up|down|move|open|close|details|preview|send|add)\w*\}/);
  });
});
