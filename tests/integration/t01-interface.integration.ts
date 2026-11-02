import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { documentExecute, documentView } from "../../src/domains/documents/service";
import { commandSchema } from "../../src/domains/documents/schema";

/**
 * Lot 1: the documents of the withdrawn category « Identité administrative »
 * stay readable; the president alone deletes them, the health right for the
 * sensitive ones; the other club keeps its own.
 */
const schema = "t01_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, seasonA: string, seasonB: string;
let presidentA: Principal, coachA: Principal, presidentB: Principal;

async function actor(org: string, role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, role, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  const p = { userId, sessionId };
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id;
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const run = (p: Principal, org: string, cmd: Record<string, unknown>) => documentExecute(db, p, commandSchema.parse(cmd), org) as Promise<{ id: string; count?: number }>;
async function doc(org: string, season: string, name: string, category: string, sensitive = false) {
  return (await db.query("INSERT INTO club_document(organization_id,season_id,name,category,sensitive,status) VALUES($1,$2,$3,$4,$5,'requested') RETURNING id", [org, season, name, category, sensitive])).rows[0].id as string;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  seasonA = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27','2026-07-01','2027-06-30') RETURNING id", [clubA])).rows[0].id;
  seasonB = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27','2026-07-01','2027-06-30') RETURNING id", [clubB])).rows[0].id;
  presidentA = await actor(clubA, "club_president");
  coachA = await actor(clubA, "coach");
  presidentB = await actor(clubB, "club_president");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("refuses a new document of the withdrawn category, keeps the old ones readable", async () => {
  expect(() => commandSchema.parse({ action: "request", seasonId: seasonA, name: "Carte", category: "identity" })).toThrow();
  const old = await doc(clubA, seasonA, "Carte d'identité d'Ana", "identity");
  expect((await documentView(db, presidentA)).documents.map((d) => d.id)).toContain(old);
});

it("lets the president alone delete them, sensitive ones included, never another club's", async () => {
  const sensitive = await doc(clubA, seasonA, "Carte avec mention médicale", "identity", true);
  const kept = await doc(clubA, seasonA, "Licence d'Ana", "licence");
  const other = await doc(clubB, seasonB, "Carte d'identité de Bob", "identity");
  await db.query("INSERT INTO document_history(document_id,actor_id,action) VALUES($1,$2,'requested')", [sensitive, presidentA.userId]);
  await expect(run(coachA, clubA, { action: "purgeRetired" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  // A president holds every right (0042), the health one included.
  expect((await run(presidentA, clubA, { action: "purgeRetired" })).count).toBe(2);
  const left = (await db.query("SELECT id FROM club_document ORDER BY name")).rows.map((r) => r.id);
  expect(left.sort()).toEqual([kept, other].sort());
  expect((await db.query("SELECT count(*)::int AS n FROM document_history WHERE document_id=$1", [sensitive])).rows[0].n).toBe(0);
  expect((await db.query("SELECT details FROM audit_log WHERE action='document.purgeRetired'")).rows[0].details).toEqual({ count: 2 });
  // Club B's president deletes club B's only.
  expect((await run(presidentB, clubB, { action: "purgeRetired" })).count).toBe(1);
  expect((await db.query("SELECT count(*)::int AS n FROM club_document WHERE id=$1", [kept])).rows[0].n).toBe(1);
});
