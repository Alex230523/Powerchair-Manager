import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { disposition, escapeHtml, externalHref, servedType } from "../src/lib/html";
import { newNonce, scriptPolicy } from "../src/lib/csp";
import { printablePage, printHandler } from "../src/domains/people/export";

/**
 * Security (07/11/2026), cross-site scripting: what someone types is shown as
 * text, never run. Scripts run only from the site or with the page's nonce;
 * a link typed by someone is a web address or nothing; HTML written by hand
 * escapes every value; a stored file is never sent as a page.
 */
const files = (dir: string, keep: (n: string) => boolean): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p, keep) : keep(n) ? [p] : [];
  });
const source = files("src", (n) => /\.(ts|tsx)$/.test(n));
describe("cross-site scripting", () => {
  it("lets only the site's scripts run: its own files, or the nonce of this very page", () => {
    const prod = scriptPolicy("abc123", { NODE_ENV: "production" });
    expect(prod).toContain("script-src 'self' 'nonce-abc123'");
    expect(prod).toContain("script-src-attr 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).not.toMatch(/unsafe-inline|unsafe-eval|\*|https:(?!\/\/vercel)|data:/);
    expect(scriptPolicy("n", { NODE_ENV: "production", VERCEL_ENV: "preview" })).toContain("https://vercel.live");
    expect(scriptPolicy("n", { NODE_ENV: "production", VERCEL_ENV: "production" })).not.toContain("vercel.live");
    expect(scriptPolicy("n", { NODE_ENV: "development" })).toContain("'unsafe-eval'");
    const nonces = new Set(Array.from({ length: 200 }, newNonce));
    expect(nonces.size).toBe(200);
    for (const n of nonces) expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    const proxy = readFileSync("src/proxy.ts", "utf8");
    expect(proxy).toContain('headers.set("x-nonce", nonce)');
    expect(proxy).toContain('headers.set("Content-Security-Policy", policy)');
    expect(proxy).toContain('response.headers.set("Content-Security-Policy", policy)');
    expect(proxy).toContain("(?!api/|_next/static|_next/image|.*\\\\..*)");
  });

  it("writes no HTML by hand in a component, and gives the nonce to the only two inline scripts", () => {
    const raw: string[] = [];
    for (const f of source) {
      const s = readFileSync(f, "utf8");
      if (/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\(|document\.write\(|\beval\(|new Function\(/.test(s)) raw.push(f);
      if (s.includes("dangerouslySetInnerHTML")) {
        expect(["src/app/[locale]/layout.tsx", "src/components/club-palette.tsx"], f).toContain(f);
        expect(s, f).toMatch(/<script nonce=\{[^}]+\} dangerouslySetInnerHTML=\{\{ __html: (themeScript|script) \}\} \/>/);
      }
    }
    expect(raw).toEqual([]);
    // The palette script is built from a closed list: nothing typed reaches it.
    expect(readFileSync("src/components/club-palette.tsx", "utf8")).toMatch(/\["night", "bordeaux", "aubergine", "brown"\]\.includes/);
  });

  it("makes a link only of a web address", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "//evil.example", "/fr/club", "", null, undefined, "https://", "http//x"])
      expect(externalHref(bad as string), String(bad)).toBeUndefined();
    for (const good of ["https://club.example", "http://club.example/page?a=1&b=2", "HTTPS://Club.example"]) expect(externalHref(good)).toBe(good);
    // Every link a component builds from a stored address goes through it.
    const raw: string[] = [];
    for (const f of source.filter((f) => f.endsWith(".tsx")))
      for (const m of readFileSync(f, "utf8").matchAll(/href=\{([^}]+)\}/g)) if (/\.\w*(_url|website|Url)\b/.test(m[1]) && !m[1].startsWith("externalHref(")) raw.push(`${f}: ${m[1]}`);
    expect(raw).toEqual([]);
    // And every address typed in a form is a web address (push and webhooks check their own).
    const loose: string[] = [];
    for (const f of source.filter((f) => f.startsWith("src/domains/")))
      for (const line of readFileSync(f, "utf8").split("\n")) if (/z\.url\(\)/.test(line) && !/endpoint:|createHook/.test(line)) loose.push(`${f}: ${line.trim()}`);
    expect(loose).toEqual([]);
    expect(readFileSync("db/migrations/0140_venue_website.sql", "utf8")).toContain("CHECK (website = '' OR website ~* '^https?://')");
  });

  it("escapes every value of the HTML written by hand: embed codes, the printable list", () => {
    expect(escapeHtml(`"><script>alert('x')</script>&`)).toBe("&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;");
    for (const f of ["src/components/integrations.tsx", "src/components/registration-forms.tsx"]) {
      const s = readFileSync(f, "utf8");
      for (const code of s.match(/`<iframe [^`]*`/g) ?? []) expect(code, f).not.toMatch(/="\$\{(?!escapeHtml\(|height\})/);
    }
    const payload = `<img src=x onerror=alert(1)>"'`;
    const page = printablePage([["Nom", "Ville"], [payload, "</td><script>alert(2)</script>"]], payload, "2026-11-07", "fr");
    expect(page).not.toContain("<img src=x");
    expect(page).not.toContain("<script>");
    expect(page).toContain("&lt;img src=x onerror=alert(1)&gt;&quot;&#39;");
    // Its only script is its print button, allowed by its hash and nothing else.
    expect(page.match(/on\w+="/g)).toEqual(['onclick="']);
    const route = readFileSync("src/app/api/people/export/route.ts", "utf8");
    expect(route).toContain("script-src 'unsafe-hashes' 'sha256-${createHash(\"sha256\").update(printHandler).digest(\"base64\")}'");
    expect(route).not.toContain("script-src 'unsafe-inline'");
    expect(createHash("sha256").update(printHandler).digest("base64")).toBe(createHash("sha256").update("window.print()").digest("base64"));
  });

  it("never sends a stored file as a page", () => {
    for (const t of ["text/html", "TEXT/HTML", "image/svg+xml", "application/xhtml+xml", "text/xml", "application/xml", "application/javascript", "text/plain", "", null, "image/png; x=<script>"]) expect(servedType(t), String(t)).toBe("application/octet-stream");
    for (const t of ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/csv; charset=utf-8"]) expect(servedType(t)).toBe(t);
    // Every route sending a type read from the database sends it through servedType, with nosniff.
    const raw: string[] = [];
    for (const f of files("src/app/api", (n) => n === "route.ts")) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/"Content-Type": ([^,}\n]+)/g)) if (!/^("|servedType\(|format === "pdf")/.test(m[1].trim())) raw.push(`${f}: ${m[1]}`);
      if (s.includes("servedType(")) expect(s, f).toContain('"X-Content-Type-Options": "nosniff"');
      expect(s, f).not.toMatch(/filename="\$\{f\.filename\}"/);
    }
    expect(raw).toEqual([]);
    // A name typed by someone cannot rewrite the header.
    const d = disposition("attachment", 'reçu "x".pdf\r\nSet-Cookie: a=b');
    expect(d).not.toMatch(/[\r\n]/);
    expect(d).toMatch(/^attachment; filename="re_u _x_.pdf__Set-Cookie_ a_b"; filename\*=UTF-8''re%C3%A7u%20%22x%22.pdf%0D%0ASet-Cookie%3A%20a%3Db$/);
  });
});
