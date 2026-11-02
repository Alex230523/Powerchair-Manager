import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { teamDetail, teamsExecute } from "../../src/domains/teams/service";
import { seasonOf } from "../../src/domains/finance/schema";
import { brusselsToday } from "../../src/domains/people/service";

/**
 * A6: the team page as a dashboard, read from the other modules. The coach
 * sees neither money nor care; the president sees everything; an empty
 * team says so honestly; a player moved to another team leaves this one's
 * board; two clubs stay apart.
 */
const schema = "a6board_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, coach: Principal, season: string, teamA: string, teamB: string, empty: string;
let ana: string, bilal: string, coachProfile: string, user: string;

async function actor(org: string, role: string, name: string, teamId: string | null = null) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,team_id) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, teamId])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person };
}
async function player(name: string, team: string) {
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  const id = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,'2008-01-01','{player}') RETURNING id", [clubA, person, name])).rows[0].id as string;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubA, team, id]);
  return id;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  const federation = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédé','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [federation])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  const p = await actor(clubA, "club_president", "Présidente");
  president = p.p;
  user = president.userId;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  teamA = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  teamB = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Ours') RETURNING id", [clubA, season])).rows[0].id;
  empty = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Vide') RETURNING id", [clubA, season])).rows[0].id;
  const c = await actor(clubA, "coach", "Coach Sam", teamA);
  coach = c.p;
  coachProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,email,phone,directory_roles) VALUES($1,$2,'Coach Sam','sam@example.test','0470 00 00 00','{coach}') RETURNING id", [clubA, c.person])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-30)", [clubA, teamA, coachProfile]);
  ana = await player("Ana", teamA);
  bilal = await player("Bilal", teamA);
  // Ana: licence of the season, a chair in repair, care instructions, a fee late.
  await db.query("INSERT INTO license(federation_id,organization_id,profile_id,season,number,status,requested_by) VALUES($1,$2,$3,$4,'L-1','active',$5)", [federation, clubA, ana, seasonOf(brusselsToday()).label, user]);
  const chair = (await db.query("INSERT INTO equipment_chair(organization_id,name,status) VALUES($1,'Strike 7','maintenance') RETURNING id", [clubA])).rows[0].id;
  await db.query("INSERT INTO equipment_chair_assignment(organization_id,chair_id,profile_id,starts_on,is_primary,created_by) VALUES($1,$2,$3,CURRENT_DATE-10,true,$4)", [clubA, chair, ana, user]);
  await db.query("INSERT INTO care_instruction(organization_id,profile_id,moment,ciphertext,created_by) VALUES($1,$2,'before_play','x',$3)", [clubA, ana, user]);
  const plan = (await db.query("INSERT INTO dues_plan(organization_id,season_id,category,amount_cents,max_installments,first_due) VALUES($1,$2,'Joueur',25000,1,CURRENT_DATE-20) RETURNING id", [clubA, season])).rows[0].id;
  const fee = (await db.query("INSERT INTO dues_receivable(organization_id,plan_id,season_id,profile_id,category,plan_snapshot,gross_cents,discount_cents,created_by) VALUES($1,$2,$3,$4,'Joueur','{}',25000,0,$5) RETURNING id", [clubA, plan, season, ana, user])).rows[0].id;
  await db.query("INSERT INTO dues_installment(receivable_id,ordinal,due_on,amount_cents) VALUES($1,1,CURRENT_DATE-5,25000)", [fee]);
  // A played league match, a match to come, an event with answers, a task on the next match.
  await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,status,our_score,their_score,created_by) VALUES($1,$2,'Lions','league',now()-interval '7 days','played',3,1,$3)", [clubA, teamA, user]);
  const next = (await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,created_by) VALUES($1,$2,'Tigres','league',now()+interval '5 days',$3) RETURNING id", [clubA, teamA, user])).rows[0].id;
  await db.query("INSERT INTO task(organization_id,kind,title,due_on,match_id,origin,created_by) VALUES($1,'transport','Réserver le minibus',CURRENT_DATE+3,$2,'manual',$3)", [clubA, next, user]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("shows the president everything: licence, chair, late fee, care, results, tasks and staff contacts", async () => {
  const v = await teamDetail(db, president, teamA);
  expect(v.can).toMatchObject({ money: true, sensitive: true, issueDues: true, matches: true });
  expect(v.board.states[ana]).toEqual({ licence: "active", chair: { name: "Strike 7", status: "maintenance", serviceDue: false }, duesLate: true, care: true });
  expect(v.board.states[bilal]).toEqual({ licence: "none", chair: null, duesLate: false, care: false });
  expect(v.board.results.map((m) => [m.opponent, m.our_score, m.their_score])).toEqual([["Lions", 3, 1]]);
  expect(v.board.record).toMatchObject({ played: 1, won: 1, scored: 3, conceded: 1 });
  expect(v.board.nextMatch?.opponent).toBe("Tigres");
  expect(v.board.tasks.map((t) => t.title)).toEqual(["Réserver le minibus"]);
  expect(v.staff.find((s) => s.profile_id === coachProfile)).toMatchObject({ email: "sam@example.test", phone: "0470 00 00 00" });
});

it("shows the coach neither money nor care", async () => {
  const v = await teamDetail(db, coach, teamA);
  expect(v.can).toMatchObject({ money: false, sensitive: false, issueDues: false });
  expect(v.board.states[ana]).toMatchObject({ licence: "active", duesLate: null, care: null });
  expect(JSON.stringify(v.board)).not.toMatch(/"duesLate":(true|false)|"care":(true|false)/);
});

it("says honestly that an empty team has nobody", async () => {
  const v = await teamDetail(db, president, empty);
  expect(v.roster).toEqual([]);
  expect(v.board.states).toEqual({});
  expect(v.board.events).toEqual([]);
  expect(v.board.results).toEqual([]);
  expect(v.board.record).toMatchObject({ played: 0 });
});

it("follows a player moved to another team", async () => {
  await teamsExecute(db, president, { action: "move", profileId: bilal, fromTeamId: teamA, toTeamId: teamB, effectiveOn: brusselsToday(), keep: false } as never, clubA);
  expect(Object.keys((await teamDetail(db, president, teamA)).board.states)).toEqual([ana]);
  expect(Object.keys((await teamDetail(db, president, teamB)).board.states)).toEqual([bilal]);
});

it("keeps two clubs apart", async () => {
  await expect(teamDetail(db, presidentB, teamA)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
