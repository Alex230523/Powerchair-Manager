import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { dashboardView } from "../../src/domains/dashboard/service";
import { setupExecute, setupView } from "../../src/domains/setup/service";

/** Wave 15 (C3): the getting-started card of a new club, from its data, for its president only. */
const schema = "w15su_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let club: string, other: string, president: Principal, coach: Principal, presidentB: Principal;

async function actor(org: string, role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const done = async (p: Principal) => (await dashboardView(db, p)).setup?.steps.filter((s) => s.done).map((s) => s.id);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  club = (await db.query("INSERT INTO organization(name,kind) VALUES('New club','club') RETURNING id")).rows[0].id;
  other = (await db.query("INSERT INTO organization(name,kind) VALUES('Other club','club') RETURNING id")).rows[0].id;
  president = await actor(club, "club_president");
  presidentB = await actor(other, "club_president");
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

it("starts at 0 of 9 and moves with the real data, one step at a time", async () => {
  const first = (await dashboardView(db, president)).setup!;
  expect(first.steps).toHaveLength(9);
  expect(first.steps.filter((s) => s.done)).toEqual([]);
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-10,CURRENT_DATE+300) RETURNING id", [club])).rows[0].id;
  expect(await done(president)).toEqual(["season"]);
  await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions')", [club, season]);
  coach = await actor(club, "coach");
  await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,'Zoé','2010-01-01','{player}' FROM p", [club]);
  expect(await done(president)).toEqual(["season", "team", "coach", "players"]);
  await db.query("INSERT INTO organization_logo(organization_id,media_type,content,updated_by) VALUES($1,'image/png',$2,$3)", [club, Buffer.from([137, 80, 78, 71]), president.userId]);
  await db.query("UPDATE organization SET presence_rules='{\"training\":{\"players\":{\"ok\":4,\"warn\":3},\"coaches\":{\"ok\":1,\"warn\":1}}}' WHERE id=$1", [club]);
  await db.query("INSERT INTO audit_log(organization_id,actor_id,action,target_id) VALUES($1,$2,'modules.changed',$3)", [club, president.userId, club]);
  expect(await done(president)).toEqual(["identity", "season", "team", "coach", "players", "modules", "presence"]);
  // The other club still starts from nothing.
  expect((await dashboardView(db, presidentB)).setup!.steps.filter((s) => s.done)).toEqual([]);
});

it("is for the president only, and can be hidden, then shown again from Settings", async () => {
  expect((await dashboardView(db, coach)).setup).toBeUndefined();
  await expect(setupExecute(db, coach, true, club)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await setupExecute(db, president, true, club);
  expect((await dashboardView(db, president)).setup).toBeUndefined();
  expect(await setupView(db, president)).toMatchObject({ hidden: true });
  await setupExecute(db, president, false, club);
  expect((await dashboardView(db, president)).setup).toBeDefined();
  await expect(setupExecute(db, presidentB, true, club)).rejects.toMatchObject({ code: "CONTEXT_CHANGED" });
});

it("disappears once the club is fully set up", async () => {
  await db.query("INSERT INTO dues_plan(organization_id,season_id,category,amount_cents,max_installments,first_due) SELECT $1,id,'Cotisation',20000,2,CURRENT_DATE FROM season WHERE organization_id=$1", [club]);
  expect((await setupView(db, president)).steps.filter((s) => !s.done).map((s) => s.id)).toEqual(["palette"]);
  await db.query("INSERT INTO audit_log(organization_id,actor_id,action,target_id) VALUES($1,$2,'organization.appearance',$3)", [club, president.userId, club]);
  expect((await setupView(db, president)).steps.every((s) => s.done)).toBe(true);
  expect((await dashboardView(db, president)).setup).toBeUndefined();
});
