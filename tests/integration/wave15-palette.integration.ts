import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { clubExecute, clubView, commandSchema } from "../../src/domains/club/service";

/** Prompt 2.9: the club palette is saved by those who manage the club, in their own club only, with an audit line. */
const schema = "w15pa_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, coachA: Principal, presidentB: Principal;

async function actor(org: string, role: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const look = async (org: string) => (await db.query("SELECT theme_palette,theme_tint FROM organization WHERE id=$1", [org])).rows[0];

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president");
  coachA = await actor(clubA, "coach");
  presidentB = await actor(clubB, "club_president");
});
beforeEach(() => {
  vi.stubEnv("PFM_MFA_SUSPENDED", "false");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("starts on night blue with a light tint", async () => {
  expect(await look(clubA)).toEqual({ theme_palette: "night", theme_tint: "light" });
});

it("saves the palette of the active club only, with an audit line", async () => {
  await clubExecute(db, presidentA, commandSchema.parse({ action: "appearance", palette: "bordeaux", tint: "strong" }), clubA);
  expect(await look(clubA)).toEqual({ theme_palette: "bordeaux", theme_tint: "strong" });
  expect(await look(clubB)).toEqual({ theme_palette: "night", theme_tint: "light" });
  expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='organization.appearance' AND organization_id=$1", [clubA])).rows[0].n).toBe(1);
  expect(await clubView(db, presidentA)).toMatchObject({ organization: { theme_palette: "bordeaux", theme_tint: "strong" } });
});

it("refuses another club, a coach and an unknown palette", async () => {
  await expect(clubExecute(db, presidentB, commandSchema.parse({ action: "appearance", palette: "brown", tint: "neutral" }), clubA)).rejects.toMatchObject({ code: "CONTEXT_CHANGED" });
  await expect(clubExecute(db, coachA, commandSchema.parse({ action: "appearance", palette: "brown", tint: "neutral" }), clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(() => commandSchema.parse({ action: "appearance", palette: "pink", tint: "light" })).toThrow();
  expect(await look(clubA)).toEqual({ theme_palette: "bordeaux", theme_tint: "strong" });
});

it("refuses a value outside the list in the database too", async () => {
  await expect(db.query("UPDATE organization SET theme_palette='pink' WHERE id=$1", [clubB])).rejects.toThrow();
});
