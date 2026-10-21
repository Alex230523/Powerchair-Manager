import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { retentionView } from "../../src/domains/statistics/retention";
import { attendanceView } from "../../src/domains/attendance/service";

/** Wave 15 (2.6): the headcount per season and team colours behind the charts, one club at a time. */
const schema = "w15ch_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, coach: Principal;

async function actor(org: string, role: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
async function season(org: string, name: string, start: number, teams: [string, string | null, string, string[]][]) {
  const s = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,$2,CURRENT_DATE+$3::int,CURRENT_DATE+$3::int+300) RETURNING id", [org, name, start])).rows[0].id;
  for (const [team, color, category, players] of teams) {
    const t = (await db.query("INSERT INTO team(organization_id,season_id,name,color,category) VALUES($1,$2,$3,$4,$5) RETURNING id", [org, s, team, color, category])).rows[0].id;
    for (const p of players) await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role) VALUES($1,$2,$3,'player')", [org, t, p]);
  }
}
async function person(org: string, name: string) {
  return (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,$2,'2000-01-01','{player}' FROM p RETURNING id", [org, name])).rows[0].id as string;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = await actor(clubA, "club_president");
  coach = await actor(clubA, "coach");
  const [ana, ben, cleo, dan] = [await person(clubA, "Ana"), await person(clubA, "Ben"), await person(clubA, "Cléo"), await person(clubA, "Dan")];
  await season(clubA, "2025-26", -400, [["Lions", "blue", "Senior", [ana, ben]]]);
  await season(clubA, "2026-27", -35, [
    ["Lions", "blue", "Senior", [ana, cleo]],
    ["Aigles", "amber", "Jeunes", [cleo, dan]],
  ]);
  const zed = await person(clubB, "Zed");
  await season(clubB, "2026-27", -35, [["Autres", "plum", "Senior", [zed]]]);
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

it("splits each season of the club by team and by category, a player once", async () => {
  const v = await retentionView(db, president);
  expect(v.headcount).toEqual([
    { season: "2025-26", total: 2, teams: [{ name: "Lions", color: "blue", count: 2 }], categories: [{ name: "Senior", count: 2 }] },
    {
      season: "2026-27",
      total: 3,
      teams: [
        { name: "Aigles", color: "amber", count: 2 },
        { name: "Lions", color: "blue", count: 1 },
      ],
      categories: [
        { name: "Jeunes", count: 2 },
        { name: "Senior", count: 1 },
      ],
    },
  ]);
  expect(v.seasons[1]).toMatchObject({ members: 3, stayed: 1, joined: 2, left: 1, rate: 50 });
  // Nothing of the other club; the coach without the directory right is refused.
  expect(JSON.stringify(v)).not.toContain("Autres");
  await expect(retentionView(db, coach)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("gives the team colours to the monthly lines", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const v = await attendanceView(db, president, today, today);
  expect(v.teams.map((t: { name: string; color: string | null }) => [t.name, t.color]).sort()).toEqual([
    ["Aigles", "amber"],
    ["Lions", "blue"],
    ["Lions", "blue"],
  ]);
});
