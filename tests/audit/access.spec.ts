import { test, expect, request as http } from "@playwright/test";
import { Pool } from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { apiRoutes, matrixRoles } from "../access-matrix";
import { menuGroups, type Workspace } from "../../src/components/menu";
import { signIn, secretsB, origin, type AuditRole } from "./support";

/**
 * Audit 26 (npm run audit:access): every API route, called for real by
 * every role (anonymous, the six demo accounts, a federation worker, the
 * president of a second club and of a second federation), compared with
 * tests/access-matrix.ts. A read never carries the other club's or the other
 * federation's data; a write with an empty body is never accepted; a link
 * with a false token is refused. AUDIT_RECORD=1 writes what was observed
 * (audit-report/access-observed.json) without failing.
 */
const fake = "00000000-0000-4000-8000-000000000000";
const concrete = (path: string) =>
  path
    .replace("[...all]", "get-session")
    .replace(/\[(id|eventId)\]/g, fake)
    .replace("[token]", "jeton-faux-0123456789abcdef")
    .replace("[slug]", "club-inconnu")
    .replace("[job]", "inconnu")
    .replace("[widget]", "palmares");

test("each role reaches exactly what the matrix says", async () => {
  test.setTimeout(40 * 60000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const observed: Record<string, Record<string, string>> = {};
  const menus: Record<string, string[]> = {};
  const problems: string[] = [];
  try {
    const demoNames = (
      await db.query("SELECT c.full_name FROM club_person c JOIN organization o ON o.id=c.organization_id WHERE o.name='Club démo Powerchair' AND 'player'=ANY(c.directory_roles) ORDER BY c.full_name LIMIT 3")
    ).rows.map((r) => r.full_name as string);
    expect(demoNames.length).toBeGreaterThan(0);
    for (const role of matrixRoles) {
      const ctx = await http.newContext({ baseURL: origin });
      if (role !== "anonymous") {
        await signIn(ctx, db, role as AuditRole);
        menus[role] = menuGroups((await (await ctx.get("/api/workspace")).json()) as Workspace).flatMap((g) => g.items.map((i) => i.route));
      }
      for (const [path, route] of Object.entries(apiRoutes)) {
        if (route.skip) continue;
        const url = "/api/" + concrete(path);
        for (const method of route.methods) {
          const response =
            method === "GET"
              ? await ctx.get(url, { maxRedirects: 0 })
              : await ctx.post(url, { headers: { origin }, data: {}, maxRedirects: 0 });
          const status = response.status();
          (observed[`${method} ${path}`] ??= {})[role] = String(status);
          const expected = route.expect?.[method]?.[role];
          if (expected !== undefined && String(expected) !== String(status)) problems.push(`${method} ${path} as ${role}: ${status}, expected ${expected}`);
          if (status >= 500) problems.push(`${method} ${path} as ${role}: server error ${status}`);
          if (method === "POST" && status < 300 && !route.acceptsEmpty) problems.push(`POST ${path} as ${role}: an empty body was accepted (${status})`);
          if (method !== "GET" || status !== 200) continue;
          const type = response.headers()["content-type"] ?? "";
          if (!/json|text|calendar|csv/.test(type)) continue;
          const body = await response.text();
          // Never the other club's or the other federation's data.
          if (!["president_b", "federation_b"].includes(role)) for (const s of secretsB) if (body.includes(s)) problems.push(`GET ${path} as ${role}: shows « ${s} » of club or federation B`);
          if (["president_b", "federation_b"].includes(role) && !route.sharedAcrossClubs) for (const s of demoNames) if (body.includes(s)) problems.push(`GET ${path} as ${role}: shows « ${s} » of the demo club`);
        }
      }
      await ctx.dispose();
    }
  } finally {
    await db.end();
  }
  mkdirSync("audit-report", { recursive: true });
  writeFileSync("audit-report/access-observed.json", JSON.stringify(observed, null, 1));
  writeFileSync("audit-report/access-menus.json", JSON.stringify(menus, null, 1));
  writeFileSync("audit-report/access-problems.txt", problems.join("\n"));
  // The log carries what was seen, so a run can be read without its artefacts.
  for (const [route, statuses] of Object.entries(observed)) console.log(`AUDIT access\t${route}\t${matrixRoles.map((r) => `${r}=${statuses[r] ?? "-"}`).join(" ")}`);
  for (const [role, routes] of Object.entries(menus)) console.log(`AUDIT menu\t${role}\t${routes.join(" ")}`);
  for (const p of problems) console.log(`AUDIT problem\t${p}`);
  if (!process.env.AUDIT_RECORD) expect(problems).toEqual([]);
});

test("a link with a false or revoked token gives nothing private", async () => {
  const ctx = await http.newContext({ baseURL: origin });
  try {
    for (const url of [
      "/api/calendar/feed/jeton-faux-0123456789abcdef",
      "/api/public/ics/jeton-faux-0123456789abcdef",
      "/api/tax/receipt/jeton-faux-0123456789abcdef",
      "/api/fundraising/public?token=jeton-faux-0123456789abcdef",
      "/api/open-events/public?token=jeton-faux-0123456789abcdef",
      `/api/registrations/public/${fake}`,
      "/fr/evenement/jeton-faux-0123456789abcdef",
      "/fr/c/club-inconnu",
    ]) {
      const r = await ctx.get(url, { maxRedirects: 0 });
      const body = await r.text();
      // An API refuses; a page may answer with its « link not valid » message.
      if (url.startsWith("/api/")) expect([400, 401, 403, 404], `${url} answered ${r.status()}`).toContain(r.status());
      else expect(r.status(), url).toBeLessThan(500);
      for (const s of [...secretsB, "Club démo Powerchair"]) expect(body, url).not.toContain(s);
    }
  } finally {
    await ctx.dispose();
  }
});
