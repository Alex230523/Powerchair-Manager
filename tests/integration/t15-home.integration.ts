import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { dashboardView } from "../../src/domains/dashboard/service";
import type { CoachFocus, FederationFocus, MemberFocus } from "../../src/domains/dashboard/focus";

/**
 * 15: the home by role. A parent of two children sees one block each, with
 * the next appointment and its answer; a coach his team without a match
 * ahead, and no money; a federation its late clubs and what waits; two
 * clubs apart.
 */
const schema = "t15_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fed: string, clubA: string, clubB: string, team: string, series: string;
let parent: Principal, coach: Principal, federation: Principal, presidentA: Principal, presidentB: Principal;
const kids: string[] = [];

async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  const p = { userId, sessionId };
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  await execute(db, p, { action: "context", mandateId });
  return p;
}
async function profile(org: string, name: string, userId?: string) {
  const person = userId ? (await db.query("SELECT id FROM person WHERE user_id=$1", [userId])).rows[0].id : (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  return (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,'2013-01-01','{player}') RETURNING id", [org, person, name])).rows[0].id as string;
}
async function event(title: string, kind: string, inDays: number) {
  return (
    await db.query(
      "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility) VALUES($1,$2,1,$3,$4,'Europe/Brussels',now()+make_interval(days=>$5),now()+make_interval(days=>$5)+interval '2 hours','2026-11-10T18:00','2026-11-10T20:00',$6,$7,'organization') RETURNING id",
      [clubA, series, title, kind, inDays, team, presidentA.userId],
    )
  ).rows[0].id as string;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [fed])).rows[0].id;
  presidentA = await actor(clubA, "club_president", "Présidente A");
  presidentB = await actor(clubB, "club_president", "Président B");
  parent = await actor(clubA, "guardian", "Nadia Parent");
  coach = await actor(clubA, "coach", "Coach A");
  federation = await actor(fed, "federation_president", "Fédération");
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [clubA, presidentA.userId])).rows[0].id;
  // Two children with their parent, both in the team.
  const me = await profile(clubA, "Nadia Parent", parent.userId);
  for (const name of ["Lucas Peeters", "Emma Peeters"]) {
    const kid = await profile(clubA, name);
    kids.push(kid);
    await db.query("INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,'Vérifié pour le test',$4)", [clubA, me, kid, presidentA.userId]);
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-10)", [clubA, team, kid]);
  }
  const coachProfile = await profile(clubA, "Coach A", coach.userId);
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-10)", [clubA, team, coachProfile]);
  // The parent chose the context after the profiles existed.
  for (const p of [parent, coach]) await execute(db, p, { action: "context", mandateId: (await db.query("SELECT id FROM role_assignment WHERE user_id=$1", [p.userId])).rows[0].id });
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("gives a parent one block per child: the next appointment with its answer, the last results", async () => {
  const training = await event("Entraînement du mardi", "training", 3);
  const register = (await db.query("INSERT INTO attendance_register(organization_id,event_id,deadline) VALUES($1,$2,now()+interval '2 days') RETURNING id", [clubA, training])).rows[0].id;
  await db.query("INSERT INTO attendance_invitation(organization_id,register_id,profile_id,response) VALUES($1,$2,$3,'present'),($1,$2,$4,'none')", [clubA, register, kids[0], kids[1]]);
  await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,status,our_score,their_score,created_by) VALUES($1,$2,'Lions','league',now()-interval '5 days','played',3,1,$3)", [clubA, team, presidentA.userId]);
  const focus = (await dashboardView(db, parent)).focus as MemberFocus;
  expect(focus.kind).toBe("member");
  const byName = Object.fromEntries(focus.people.map((p) => [p.name, p]));
  expect(Object.keys(byName).sort()).toEqual(["Emma Peeters", "Lucas Peeters", "Nadia Parent"]);
  expect([byName["Lucas Peeters"].next?.title, byName["Lucas Peeters"].next?.response, byName["Lucas Peeters"].next?.open]).toEqual(["Entraînement du mardi", "present", true]);
  expect(byName["Emma Peeters"].next?.response).toBe("none");
  expect(byName["Nadia Parent"].next).toBeNull();
  expect(byName["Lucas Peeters"].results.map((r) => [r.opponent, r.ours, r.theirs])).toEqual([["Lions", 3, 1]]);
});

it("gives a coach his team with its answers, nothing planned for a match, and no money", async () => {
  const d = await dashboardView(db, coach);
  const focus = d.focus as CoachFocus;
  expect(focus.teams.map((t) => t.name)).toEqual(["Aigles"]);
  expect(focus.teams[0].nextTraining).toMatchObject({ title: "Entraînement du mardi", invited: 2, answered: 1, present: 1 });
  expect(focus.teams[0].nextMatch).toBeNull();
  expect(d.finance).toBeUndefined();
});

it("gives the federation its late clubs and what waits for it, never one club's data to another", async () => {
  const fee = (await db.query("INSERT INTO affiliation_fee(organization_id,name,basis,frequency,amount_cents,due_days,created_by) VALUES($1,'Affiliation','club','annual',10000,30,$2) RETURNING id", [fed, federation.userId])).rows[0].id;
  await db.query("INSERT INTO affiliation_due(fee_id,organization_id,period,opens_on,due_on,amount_cents) VALUES($1,$2,'2026-01',CURRENT_DATE-40,CURRENT_DATE-10,10000)", [fee, clubB]);
  await db.query("INSERT INTO calendar_place(organization_id,name,share_status) VALUES($1,'Salle B','pending')", [clubB]).catch(() => undefined);
  const focus = (await dashboardView(db, federation)).focus as FederationFocus;
  expect(focus.kind).toBe("federation");
  expect(focus.lateClubs).toBe(1);
  expect(focus.pending.places).toBeGreaterThanOrEqual(0);
  // A club president gets no focus of another club.
  expect((await dashboardView(db, presidentB)).focus).toBeUndefined();
});
