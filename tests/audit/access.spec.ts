import { test, expect, request as http } from "@playwright/test";
import { Pool } from "pg";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const privateB = secretsB.filter((s) => !s.startsWith("Fédération"));

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
          // The federations' names are public (a club picks its federation from the list): only B's private data count.
          if (!["president_b", "federation_b"].includes(role)) for (const s of privateB) if (body.includes(s)) problems.push(`GET ${path} as ${role}: shows « ${s} » of club or federation B`);
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

/**
 * Security (06/11/2026), Broken Access Control (IDOR/BOLA): the president of
 * club B and the federation B call every route that takes an identifier, in
 * its path or its query, with the real identifiers of the demo club and of its
 * federation (one per table). Nothing opens: no file, no line of the demo's
 * people. The query parameters are read from each route's own source.
 */
test("an identifier of the demo club or federation, given by club B or federation B, opens nothing", async () => {
  test.setTimeout(30 * 60000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const problems: string[] = [];
  let calls = 0;
  try {
    const demoClub = (await db.query("SELECT id FROM organization WHERE name='Club démo Powerchair'")).rows[0].id as string;
    const demoFed = (await db.query("SELECT id FROM organization WHERE name='BPCF (démo)' AND kind='federation'")).rows[0].id as string;
    const names = (await db.query("SELECT full_name FROM club_person WHERE organization_id=$1 AND length(full_name)>5", [demoClub])).rows.map((r) => r.full_name as string);
    expect(names.length).toBeGreaterThan(0);
    // One real identifier per table holding the demo's rows, and the demo's people (profiles and identities).
    const tables = (
      await db.query(
        `SELECT a.table_name FROM information_schema.columns a JOIN information_schema.columns b ON b.table_name=a.table_name AND b.table_schema=a.table_schema AND b.column_name='id' AND b.data_type='uuid'
          WHERE a.table_schema=current_schema() AND a.column_name='organization_id' ORDER BY a.table_name`,
      )
    ).rows.map((r) => r.table_name as string);
    const ids = new Set<string>([demoClub, demoFed]);
    for (const t of tables) for (const r of (await db.query(`SELECT id::text AS id FROM "${t}" WHERE organization_id=ANY($1::uuid[]) LIMIT 1`, [[demoClub, demoFed]])).rows) ids.add(r.id);
    for (const r of (await db.query("SELECT id::text AS id,person_id::text AS person FROM club_person WHERE organization_id=$1 LIMIT 5", [demoClub])).rows) ids.add(r.id).add(r.person);
    // The routes: an [id] in the path, or an identifier read from the query.
    const probes: { path: string; build: (id: string) => string }[] = [];
    for (const [path, route] of Object.entries(apiRoutes)) {
      if (route.skip || !route.methods.includes("GET")) continue;
      if (/\[(id|eventId)\]/.test(path)) probes.push({ path, build: (id) => "/api/" + concrete(path).replace(fake, id) });
      const file = `src/app/api/${path}/route.ts`;
      if (!existsSync(file)) continue;
      const params = [...new Set([...readFileSync(file, "utf8").matchAll(/searchParams\.get\("([A-Za-z]+)"\)/g)].map((m) => m[1]))].filter((n) => /id$|Id$|^(profile|ticket|ubl|certificate|exercise|team|season|match|event|document|file|person)$/.test(n));
      for (const name of params) probes.push({ path: `${path}?${name}=`, build: (id) => `/api/${concrete(path)}?${name}=${id}` });
    }
    expect(probes.length).toBeGreaterThan(10);
    for (const role of ["president_b", "federation_b"] as const) {
      const ctx = await http.newContext({ baseURL: origin });
      await signIn(ctx, db, role);
      for (const probe of probes)
        for (const id of ids) {
          const r = await ctx.get(probe.build(id), { maxRedirects: 0 });
          calls++;
          const status = r.status();
          if (status >= 500) problems.push(`GET ${probe.path} (${id}) as ${role}: server error ${status}`);
          if (status < 200 || status >= 300) continue;
          const type = r.headers()["content-type"] ?? "";
          if (!/json|text\/plain|text\/html/.test(type)) {
            problems.push(`GET ${probe.path} (${id}) as ${role}: a file (${type}) opened with an identifier of the demo`);
            continue;
          }
          if (apiRoutes[probe.path.split("?")[0]]?.sharedAcrossClubs) continue;
          const body = await r.text();
          for (const n of names) if (body.includes(n)) problems.push(`GET ${probe.path} (${id}) as ${role}: shows « ${n} » of the demo club`);
        }
      await ctx.dispose();
    }
  } finally {
    await db.end();
  }
  mkdirSync("audit-report", { recursive: true });
  writeFileSync("audit-report/bola-problems.txt", problems.join("\n"));
  console.log(`AUDIT bola\t${calls} calls`);
  for (const p of problems) console.log(`AUDIT problem\t${p}`);
  if (!process.env.AUDIT_RECORD) expect([...new Set(problems)]).toEqual([]);
});

/** Security (06/11/2026): a club no longer attaches itself to a federation; it asks, the federation decides. */
test("club B cannot attach itself to the demo federation", async () => {
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const ctx = await http.newContext({ baseURL: origin });
  try {
    const demoFed = (await db.query("SELECT id FROM organization WHERE name='BPCF (démo)' AND kind='federation'")).rows[0].id as string;
    const clubB = (await db.query("SELECT id,federation_id FROM organization WHERE name='Club audit B'")).rows[0] as { id: string; federation_id: string };
    await signIn(ctx, db, "president_b");
    const r = await ctx.post("/api/club", { headers: { origin }, data: { action: "identity", name: "Club audit B", contactEmail: "", federationId: demoFed, organizationId: clubB.id } });
    expect(r.status(), await r.text()).toBe(200);
    const after = (await db.query("SELECT federation_id,federation_request_id FROM organization WHERE id=$1", [clubB.id])).rows[0];
    expect(after.federation_id).toBe(clubB.federation_id);
    expect(after.federation_request_id).toBe(demoFed);
    // Its transfer market stays the one of its own federation: no demo player in it.
    const market = await (await ctx.get("/api/transfers")).text();
    for (const n of (await db.query("SELECT full_name FROM club_person cp JOIN organization o ON o.id=cp.organization_id WHERE o.name='Club démo Powerchair' AND length(full_name)>5")).rows) expect(market).not.toContain(n.full_name);
    await db.query("UPDATE organization SET federation_request_id=NULL,federation_requested_at=NULL,federation_requested_by=NULL WHERE id=$1", [clubB.id]);
  } finally {
    await ctx.dispose();
    await db.end();
  }
});
