import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { seasonPlanExecute, seasonPlanTick, seasonPlanView } from "../../src/domains/seasons/plan";
import { brusselsDay } from "../../src/lib/today";

/**
 * 16: « Préparer la saison suivante ». Left halfway and resumed, launched
 * twice without creating anything twice, a skipped step respected, the
 * scheduled email cancellable, the issue and the check run by the daily
 * jobs, reserved to the presidency, two clubs.
 */
const schema = "t16_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, presidentB: Principal, coachA: Principal, seasonA: string, team: string, kept: string, leaving: string;

async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, role === "coach" ? ["teams.manage"] : []])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
async function player(name: string) {
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  const id = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,email,directory_roles) VALUES($1,$2,$3,'2010-01-01',$4,'{player}') RETURNING id", [clubA, person, name, `${randomUUID()}@example.test`])).rows[0].id as string;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-100)", [clubA, team, id]);
  return id;
}
const view = (p: Principal) => seasonPlanView(db, p) as Promise<Extract<Awaited<ReturnType<typeof seasonPlanView>>, { material: unknown }>>;
const version = async () => (await view(presidentA)).plan.version;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president", "Présidente A");
  presidentB = await actor(clubB, "club_president", "Président B");
  coachA = await actor(clubA, "coach", "Coach A");
  seasonA = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2025-2026',CURRENT_DATE-300,CURRENT_DATE+30) RETURNING id", [clubA])).rows[0].id;
  await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2025-2026',CURRENT_DATE-300,CURRENT_DATE+30)", [clubB]);
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, seasonA])).rows[0].id;
  kept = await player("Ana Gardée");
  leaving = await player("Bilal Partant");
  await db.query("INSERT INTO dues_plan(organization_id,season_id,category,amount_cents,max_installments,first_due) VALUES($1,$2,'Jeunes',15000,1,CURRENT_DATE-200)", [clubA, seasonA]);
  await db.query("INSERT INTO grant_application(organization_id,season_id,funder,status,deadline_on,created_by) VALUES($1,$2,'Province','granted',CURRENT_DATE-100,$3)", [clubA, seasonA, presidentA.userId]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("is the presidency's: the card from 45 days before the end, never for a coach", async () => {
  const v = await view(presidentA);
  expect(v.daysLeft).toBe(30);
  expect(v.show).toBe(true);
  expect(v.plan.version).toBe(0);
  expect(v.material.review).toMatchObject({ players: 2, teams: 1 });
  expect(v.plan.choices.season).toMatchObject({ name: "2026-2027" });
  await expect(seasonPlanView(db, coachA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(seasonPlanExecute(db, coachA, { action: "save", expectedVersion: 0, step: "review", state: "done" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("is left halfway and resumed with its choices", async () => {
  await seasonPlanExecute(db, presidentA, { action: "save", expectedVersion: 0, step: "review", state: "done" });
  const v1 = await version();
  await seasonPlanExecute(db, presidentA, { action: "save", expectedVersion: v1, step: "players", state: "done", choices: { players: { teams: [{ teamId: team, profiles: [kept] }] } } });
  // A stale page is refused.
  await expect(seasonPlanExecute(db, presidentA, { action: "save", expectedVersion: v1, step: "check", state: "done" })).rejects.toMatchObject({ code: "STALE_VERSION" });
  // The affiliations step is skipped.
  await seasonPlanExecute(db, presidentA, { action: "save", expectedVersion: await version(), step: "affiliations", state: "skipped" });
  const send = brusselsDay(new Date(Date.now() + 5 * 86400000));
  await seasonPlanExecute(db, presidentA, {
    action: "save",
    expectedVersion: await version(),
    step: "communication",
    state: "done",
    choices: { communication: { subject: "Nouvelle saison 2026-2027", text: "La saison reprend bientôt.", sendOn: send } },
  });
  const v = await view(presidentA);
  expect(v.plan.steps).toMatchObject({ review: "done", players: "done", affiliations: "skipped", season: "todo" });
  expect(v.plan.choices.players.teams[0].profiles).toEqual([kept]);
  expect(v.summary.some((x) => x.step === "affiliations")).toBe(false);
  // Club B starts from nothing.
  expect((await view(presidentB)).plan.version).toBe(0);
});

it("launches once: launching again creates nothing twice", async () => {
  const first = (await seasonPlanExecute(db, presidentA, { action: "launch", expectedVersion: await version() })) as { season: boolean; plans: number; tasks: number; actions: number };
  expect(first).toMatchObject({ season: true, plans: 1 });
  const again = await seasonPlanExecute(db, presidentA, { action: "launch", expectedVersion: await version() });
  expect(again).toEqual({ season: false, plans: 0, tasks: 0, actions: 0 });
  expect((await db.query("SELECT count(*)::int AS n FROM season WHERE organization_id=$1 AND name='2026-2027'", [clubA])).rows[0].n).toBe(1);
  const next = (await db.query("SELECT id FROM season WHERE organization_id=$1 AND name='2026-2027'", [clubA])).rows[0].id;
  // Only the kept player follows the team.
  expect((await db.query("SELECT m.profile_id FROM team_membership m JOIN team t ON t.id=m.team_id WHERE t.season_id=$1", [next])).rows.map((r) => r.profile_id)).toEqual([kept]);
  expect((await db.query("SELECT count(*)::int AS n FROM task WHERE organization_id=$1 AND source_kind='season_plan'", [clubA])).rows[0].n).toBe(first.tasks);
  expect((await db.query("SELECT count(*)::int AS n FROM newsletter WHERE organization_id=$1", [clubA])).rows[0].n).toBe(1);
  const actions = (await view(presidentA)).plan.actions;
  expect(actions.map((a) => [a.kind, a.status]).sort()).toEqual([
    ["dues_issue", "scheduled"],
    ["newsletter", "scheduled"],
    ["season_check", "scheduled"],
  ]);
  expect((await view(presidentA)).show).toBe(false);
  // Club B sees none of it, nor can cancel it.
  await expect(seasonPlanExecute(db, presidentB, { action: "cancel", actionId: actions[0].id })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("cancels the email before it leaves; the daily jobs run the rest at its date", async () => {
  const actions = (await view(presidentA)).plan.actions;
  const mail = actions.find((a) => a.kind === "newsletter")!;
  await seasonPlanExecute(db, presidentA, { action: "cancel", actionId: mail.id });
  await expect(seasonPlanExecute(db, presidentA, { action: "cancel", actionId: mail.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  // The dates come.
  await db.query("UPDATE season_plan_action SET run_on=CURRENT_DATE-1 WHERE organization_id=$1", [clubA]);
  expect(await seasonPlanTick(db)).toBe(2);
  expect(await seasonPlanTick(db)).toBe(0);
  const done = Object.fromEntries((await view(presidentA)).plan.actions.map((a) => [a.kind, a.status]));
  expect(done).toEqual({ dues_issue: "done", newsletter: "cancelled", season_check: "done" });
  const next = (await db.query("SELECT id FROM season WHERE organization_id=$1 AND name='2026-2027'", [clubA])).rows[0].id;
  expect((await db.query("SELECT profile_id FROM dues_receivable WHERE season_id=$1", [next])).rows.map((r) => r.profile_id)).toEqual([kept]);
  expect((await db.query("SELECT count(*)::int AS n FROM season_check WHERE season_id=$1", [next])).rows[0].n).toBe(1);
  expect((await db.query("SELECT status FROM newsletter WHERE organization_id=$1", [clubA])).rows[0].status).toBe("draft");
  expect(leaving).toBeTruthy();
});
