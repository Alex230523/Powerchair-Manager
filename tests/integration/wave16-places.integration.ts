import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { teamsExecute, teamsView, teamDetail } from "../../src/domains/teams/service";
import { registrationExecute } from "../../src/domains/registrations/service";
import { dashboardView } from "../../src/domains/dashboard/service";
import { rolloverExecute } from "../../src/domains/seasons/rollover";

/** Wave 16 (R1): places per team, in two clubs. */
const schema = "w16pl_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, coachA: Principal, presidentB: Principal, applicant: Principal;
let season: string, lions: string, tigers: string, teamB: string, zoe: string, yanis: string;

async function actor(org: string, role: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const player = async (org: string, name: string) =>
  (
    await db.query(
      "WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,$2,'2010-01-01','{player}' FROM p RETURNING id",
      [org, name],
    )
  ).rows[0].id as string;
const assign = (org: string, team: string, profile: string) =>
  db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-1)", [org, team, profile]);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president");
  coachA = await actor(clubA, "coach");
  presidentB = await actor(clubB, "club_president");
  applicant = await actor(clubA, "guardian");
  season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  const seasonB = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubB])).rows[0].id;
  lions = (await teamsExecute(db, presidentA, { action: "create", seasonId: season, name: "Lions", category: "", level: "", homeLocation: "", color: "blue", capacity: 2 }, clubA)).id!;
  tigers = (await teamsExecute(db, presidentA, { action: "create", seasonId: season, name: "Tigres", category: "", level: "", homeLocation: "", color: null }, clubA)).id!;
  teamB = (await teamsExecute(db, presidentB, { action: "create", seasonId: seasonB, name: "Club B équipe", category: "", level: "", homeLocation: "", color: null }, clubB)).id!;
  zoe = await player(clubA, "Zoé Martin");
  yanis = await player(clubA, "Yanis Peeters");
  await assign(clubA, lions, zoe);
  await assign(clubA, tigers, yanis);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("keeps no limit by default and shows the places on the cards", async () => {
  const cards = (await teamsView(db, presidentA)).teams;
  expect(cards.map((t) => [t.name, t.capacity, t.players])).toEqual([
    ["Lions", 2, 1],
    ["Tigres", null, 1],
  ]);
});

it("saves every team's places at once, in its own club only, for those who manage teams", async () => {
  await teamsExecute(db, presidentA, { action: "capacities", items: [{ id: lions, capacity: 2 }, { id: tigers, capacity: 1 }] }, clubA);
  expect((await teamsView(db, presidentA)).teams.map((t) => t.capacity)).toEqual([2, 1]);
  await expect(teamsExecute(db, presidentB, { action: "capacities", items: [{ id: lions, capacity: 9 }] }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(teamsExecute(db, coachA, { action: "capacities", items: [{ id: lions, capacity: 9 }] }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(teamsExecute(db, presidentA, { action: "capacities", items: [{ id: lions, capacity: 0 }] }, clubA)).rejects.toBeTruthy();
  expect((await db.query("SELECT capacity FROM team WHERE id=$1", [teamB])).rows[0].capacity).toBeNull();
});

it("warns after a move into a full team, without blocking it", async () => {
  // Tigres: 1 place, Yanis already there; Zoé joins and keeps the Lions.
  const others = (await teamDetail(db, presidentA, lions)).others;
  expect(others).toEqual([expect.objectContaining({ name: "Tigres", capacity: 1, players: 1 })]);
  const r = (await teamsExecute(db, presidentA, { action: "move", profileId: zoe, fromTeamId: lions, toTeamId: tigers, effectiveOn: new Date().toISOString().slice(0, 10), keep: true }, clubA)) as {
    over?: boolean;
  };
  expect(r.over).toBe(true);
  // The president's home lists the team over its places.
  const todos = (await dashboardView(db, presidentA)).todos;
  expect(todos.find((t) => t.key === "teamsOverCapacity")?.count).toBe(1);
  expect((await dashboardView(db, presidentB)).todos.find((t) => t.key === "teamsOverCapacity")).toBeUndefined();
});

it("refuses to accept a registration into a full team unless confirmed", async () => {
  const form = (
    await db.query("INSERT INTO registration_form(organization_id,season_id,title,published) VALUES($1,$2,'Inscriptions',true) RETURNING id", [clubA, season])
  ).rows[0].id;
  const application = (
    await db.query(
      "INSERT INTO registration_application(organization_id,form_id,applicant_user_id,season_id,subject_name,birth_date,locale,form_snapshot,status,submitted_at) VALUES($1,$2,$3,$4,'Nouveau Joueur','2012-03-04','fr','{\"fields\":[]}','review',now()) RETURNING id,version",
      [clubA, form, applicant.userId, season],
    )
  ).rows[0];
  const decide = (accept: boolean) =>
    registrationExecute(
      db,
      presidentA,
      { action: "decision", id: application.id, expectedVersion: application.version, status: "accepted", message: "", teamId: tigers, confirmDuplicate: false, acceptOverCapacity: accept },
      clubA,
    );
  await expect(decide(false)).rejects.toMatchObject({ code: "TEAM_FULL" });
  await decide(true);
  expect(
    (await db.query("SELECT count(*)::int AS n FROM team_membership m JOIN club_person cp ON cp.id=m.profile_id WHERE m.team_id=$1 AND cp.full_name='Nouveau Joueur'", [tigers])).rows[0].n,
  ).toBe(1);
});

it("copies the places with the team into the next season", async () => {
  await rolloverExecute(
    db,
    presidentA,
    {
      fromSeasonId: season,
      name: "2027-28",
      startsOn: new Date(Date.now() + 250 * 86400000).toISOString().slice(0, 10),
      endsOn: new Date(Date.now() + 600 * 86400000).toISOString().slice(0, 10),
      teams: [{ teamId: lions, profiles: [] }],
      copyPlans: false,
    } as Parameters<typeof rolloverExecute>[2],
    clubA,
  );
  expect((await db.query("SELECT capacity,color FROM team WHERE organization_id=$1 AND name='Lions' AND id<>$2", [clubA, lions])).rows[0]).toEqual({ capacity: 2, color: "blue" });
});
