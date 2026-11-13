import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { apiRoutes, pages } from "./access-matrix";
import { matrixMarkdown } from "../scripts/access-matrix-doc";

/** Audit 26: no route or page without a decision on who reaches it. */
function routesUnder(dir: string, file: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = `${dir}/${name}`;
    if (statSync(full).isDirectory()) return routesUnder(full, file, prefix ? `${prefix}/${name}` : name);
    return name === file ? [prefix] : [];
  });
}
describe("access matrix", () => {
  it("lists every API route, with the methods it really has", () => {
    const found = routesUnder("src/app/api", "route.ts").sort();
    expect(Object.keys(apiRoutes).sort()).toEqual(found);
    for (const path of found) {
      const source = readFileSync(`src/app/api/${path}/route.ts`, "utf8");
      const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((m) => new RegExp(`export (async )?function ${m}\\b|export const ${m}\\b`).test(source));
      expect([...apiRoutes[path].methods].sort(), path).toEqual(methods.sort());
    }
  });
  // 13/11/2026: a route the audit calls has its expected answer for every role,
  // so a change of rights fails the CI instead of passing unseen.
  it("expects an answer from every role on every route the audit calls", () => {
    const roles = ["anonymous", "president", "coach", "player", "parent", "federation", "referee", "federation_worker", "president_b", "federation_b"];
    for (const [path, route] of Object.entries(apiRoutes)) {
      if (route.skip) continue;
      for (const method of route.methods) expect(Object.keys(route.expect?.[method] ?? {}).sort(), `${method} ${path}`).toEqual([...roles].sort());
    }
  });
  it("lists every page", () => {
    const found = routesUnder("src/app/[locale]", "page.tsx").map((p) => "/" + p).sort();
    expect(Object.keys(pages).sort()).toEqual(found);
  });
  it("keeps docs/MATRICE-DROITS.md written from the matrix", () => {
    expect(readFileSync("docs/MATRICE-DROITS.md", "utf8")).toBe(matrixMarkdown());
  });
  it("runs both audits in the CI, the visual one failing on any new finding", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(ci).toContain("npm run audit:ui");
    expect(ci).toContain("npm run audit:access");
    expect(JSON.parse(readFileSync("tests/audit/exceptions.json", "utf8")).every((e: { reason?: string }) => !!e.reason?.trim())).toBe(true);
  });
});
