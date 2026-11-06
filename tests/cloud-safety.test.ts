import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { databaseUrl, encryptedDatabase, poolSettings, sessionGuards } from "../src/lib/env";
import { pageHeaders, robotsHeaders, widgetHeaders } from "../src/lib/security-headers";

/**
 * Security (06/11/2026), cloud misconfigurations: the site runs in Europe
 * next to its database, reaches it encrypted, lets it cut what it left
 * behind, sends the headers that close a browser's doors, keeps previews out
 * of search engines, caches nothing private in a shared cache, and runs its
 * workflows on fixed versions of the actions with a read-only token.
 */
const files = (dir: string, keep: (n: string) => boolean): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p, keep) : keep(n) ? [p] : [];
  });
const value = (list: readonly { key: string; value: string }[], key: string) => list.find((h) => h.key === key)?.value ?? "";

describe("cloud misconfigurations", () => {
  it("runs the functions in Frankfurt, next to the database, never in the United States by default", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(vercel.regions).toEqual(["fra1"]);
    expect(readFileSync("docs/PRODUCTION.md", "utf8")).toContain("aws-eu-central-1");
    // The privacy page says « UE »: it has to stay true.
    expect(readFileSync("src/domains/legal/service.ts", "utf8")).toContain('hosting: { region: "UE"');
  });

  it("reaches a database outside this machine encrypted only", () => {
    const remote = "postgresql://pfm:x@ep-cool-name.eu-central-1.aws.neon.tech/pfm";
    for (const bad of [remote, remote + "?sslmode=disable", remote + "?sslmode=prefer", remote + "?sslmode=allow", remote + "?ssl=true"]) {
      expect(() => databaseUrl({ DATABASE_URL: bad }), bad).toThrow(/sslmode/);
    }
    for (const good of [remote + "?sslmode=require", remote + "?sslmode=verify-full&channel_binding=require", remote + "?sslmode=REQUIRE"]) expect(databaseUrl({ DATABASE_URL: good })).toBe(good);
    // On this machine, or in a container beside it, nothing leaves: no encryption needed.
    for (const local of ["postgresql://pfm:pfm_ci@localhost:5432/pfm", "postgresql://127.0.0.1/pfm", "postgresql://[::1]/pfm", "postgresql://pfm@postgres:5432/pfm", "postgresql:///pfm?host=/var/run/postgresql"])
      expect(encryptedDatabase(new URL(local)), local).toBe(true);
    // The preview build stops before the migrations on the same rule.
    const build = readFileSync("scripts/vercel-build.mjs", "utf8");
    expect(build).toContain('for (const name of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"])');
    expect(build).toContain('["require", "verify-ca", "verify-full"].includes(mode ?? "")');
    expect(build.indexOf("sslmode=require (or verify-full)")).toBeLessThan(build.indexOf('run("node", ["scripts/migrate.mjs"])'));
  });

  it("lets the database cut a statement or a transaction the site left behind", () => {
    expect(poolSettings.query_timeout).toBeLessThanOrEqual(3000);
    expect(sessionGuards).toMatch(/statement_timeout = (\d+)/);
    expect(Number(sessionGuards.match(/statement_timeout = (\d+)/)?.[1])).toBeGreaterThan(poolSettings.query_timeout);
    expect(sessionGuards).toMatch(/idle_in_transaction_session_timeout = \d+/);
    const db = readFileSync("src/lib/db.ts", "utf8");
    expect(db.match(/guardPool\(\s*new Pool\(/g)).toHaveLength(2);
    expect(db.match(/new Pool\(/g)).toHaveLength(2);
    // Never as a startup parameter: Neon's pooler refuses the connection.
    expect(JSON.stringify(poolSettings)).not.toMatch(/statement_timeout|options/);
  });

  it("closes the doors of the browser on every page, and keeps previews and the API out of search engines", () => {
    expect(value(pageHeaders, "Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(value(pageHeaders, "Permissions-Policy")).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\).*payment=\(\)/);
    expect(value(pageHeaders, "X-Content-Type-Options")).toBe("nosniff");
    expect(value(widgetHeaders, "Strict-Transport-Security")).toContain("max-age=63072000");
    expect(robotsHeaders({ VERCEL_ENV: "preview" })).toEqual([{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }]);
    expect(robotsHeaders({ VERCEL_ENV: "production" })).toEqual([{ source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }]);
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain("...robotsHeaders(process.env)");
    expect(config).toMatch(/poweredByHeader: false/);
    expect(config).toMatch(/productionBrowserSourceMaps: false/);
  });

  it("caches nothing private in a shared cache and opens the API to no other site", () => {
    const routes = files("src/app/api", (n) => n === "route.ts");
    expect(routes.length).toBeGreaterThan(100);
    const wrong: string[] = [];
    for (const f of routes) {
      const s = readFileSync(f, "utf8");
      // A route that reads a session answers for one person: never « public », never s-maxage.
      if (/getSession\(|principal\(/.test(s) && /Cache-Control["']?:\s*["'][^"']*(public|s-maxage)/.test(s)) wrong.push(f + ": shared cache");
      if (/Access-Control-Allow-(Origin|Credentials)/.test(s)) wrong.push(f + ": CORS");
    }
    expect(wrong).toEqual([]);
  });

  it("runs every workflow, and every template meant to become one, on a fixed version of each action and a read-only token", () => {
    const flows = [...files(".github/workflows", (n) => n.endsWith(".yml")), ...files("docs/production", (n) => n.endsWith(".yml"))];
    expect(flows.length).toBeGreaterThanOrEqual(4);
    for (const f of flows) {
      const s = readFileSync(f, "utf8");
      expect(s, f).toMatch(/^permissions:\n\s+contents: read$/m);
      for (const use of s.match(/uses:\s*\S+/g) ?? []) expect(use, f).toMatch(/@[0-9a-f]{40}$/);
    }
  });
});
