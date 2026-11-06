import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { escapeLike } from "../src/lib/sql";

/**
 * Security (06/11/2026), SQL injection: every value that comes from a request
 * reaches PostgreSQL as a parameter ($1, $2...), never inside the SQL text.
 * The SQL text may be put together from constant fragments, fixed table or
 * column names, and choices between two literals; never from a command, an
 * input, a body, a query string or a search. This test reads the whole source
 * so that a new query cannot break the rule unseen.
 */
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
const sources = files("src").map((f) => ({ f, s: readFileSync(f, "utf8") }));
const SQL = /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|WHERE|ORDER BY|GROUP BY|VALUES)\b/;
const REQUEST = /\b(cmd|command|input|body|raw|args?|req|request|params|searchParams|url|q|search|needle|filters?|query|options|opts)\b/;
const LITERAL_CHOICE = /^[\w.!]+\s*(?:(?:===|!==|==|!=)\s*(?:"[^"]*"|'[^']*'|\d+))?\s*\?\s*(?:"[^"]*"|'[^']*'|`[^`$]*`)\s*:\s*(?:"[^"]*"|'[^']*'|`[^`$]*`)$/;

/** The template literals of a file, nested ${…} included. */
function* templates(s: string): Generator<{ at: number; text: string }> {
  let i = 0;
  for (;;) {
    const a = s.indexOf("`", i);
    if (a < 0) return;
    let j = a + 1,
      depth = 0;
    while (j < s.length) {
      const ch = s[j];
      if (ch === "\\") {
        j += 2;
        continue;
      }
      if (ch === "$" && s[j + 1] === "{") {
        depth++;
        j += 2;
        continue;
      }
      if (ch === "}" && depth) {
        depth--;
        j++;
        continue;
      }
      if (ch === "`" && !depth) break;
      j++;
    }
    yield { at: a, text: s.slice(a + 1, j) };
    i = j + 1;
  }
}

describe("SQL injection", () => {
  it("never puts a value of the request inside the SQL text", () => {
    const found: string[] = [];
    let checked = 0;
    for (const { f, s } of sources)
      for (const t of templates(s)) {
        if (!t.text.includes("${") || !SQL.test(t.text)) continue;
        for (const m of t.text.matchAll(/\$\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
          checked++;
          const expr = m[1].trim();
          if (REQUEST.test(expr) && !LITERAL_CHOICE.test(expr)) found.push(`${f}:${s.slice(0, t.at).split("\n").length}: \${${expr}}`);
        }
      }
    expect(checked).toBeGreaterThan(200);
    expect(found).toEqual([]);
  });
  it("never concatenates a value of the request to a query", () => {
    const found: string[] = [];
    for (const { f, s } of sources)
      for (const m of s.matchAll(/\.query(?:<[^>]*>)?\(([^;]{0,400}?),\s*\[/gs))
        if (/\+\s*(cmd|command|input|body|raw|args?|q|search|params)\b/.test(m[1])) found.push(`${f}:${s.slice(0, m.index).split("\n").length}`);
    expect(found).toEqual([]);
  });
  it("never builds dynamic SQL in the database without format(%I, %L)", () => {
    for (const f of readdirSync("db/migrations").filter((n) => n.endsWith(".sql"))) {
      const sql = readFileSync(join("db/migrations", f), "utf8");
      for (const m of sql.matchAll(/\bEXECUTE\s+(?!FUNCTION|PROCEDURE)([^;]+);/gi)) expect(m[1], f).toMatch(/^format\(/i);
    }
  });
  it("matches a typed search as text, wildcards escaped", () => {
    expect(escapeLike("50%")).toBe("50\\%");
    expect(escapeLike("A_B")).toBe("A\\_B");
    expect(escapeLike("C:\\temp")).toBe("C:\\\\temp");
    expect(escapeLike("Club démo")).toBe("Club démo");
    // Every search with '%'||$n||'%' passes its value through escapeLike (or escapes it the same way).
    for (const { f, s } of sources) if (/ILIKE '%'\|\|\$\d\|\|'%'/.test(s)) expect(/escapeLike\(|replace\(\/\[\\\\%_\]\/g/.test(s), f).toBe(true);
  });
});
