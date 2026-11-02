import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { onboardingExecute, onboardingTick, onboardingView } from "../../src/domains/onboarding/service";
import { tasksExecute } from "../../src/domains/tasks/service";
import { taskCommand } from "../../src/domains/tasks/schema";

/**
 * Parcours d'accueil: an invited coach gets his club's journey when he
 * accepts, a referee his federation's; a step ticks after the document is
 * uploaded; a meeting sits in both people's to-do; a late step is recalled;
 * the club follows; another club's journey stays out of sight.
 */
const schema = "onb_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, fed: string, president: Principal, presidentB: Principal, fedPresident: Principal, coach: Principal & { email: string }, referee: Principal & { email: string };
let presidentProfile: string, coachRun: string;
const run = (p: Principal, body: Record<string, unknown>, org: string) => onboardingExecute(db, p, body as never, org) as Promise<{ id: string }>;

async function user(name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID(),
    email = userId + "@example.test";
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, email]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  return { userId, sessionId, email };
}
async function head(org: string, role: string, name: string, profile: boolean) {
  const u = await user(name);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, u.userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, u.userId, role])).rows[0].id as string;
  await execute(db, u, { action: "context", mandateId });
  const pid = profile
    ? ((await db.query("INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,$2 FROM person WHERE user_id=$3 RETURNING id", [org, name, u.userId])).rows[0].id as string)
    : "";
  return { p: u, profile: pid };
}
async function invite(by: Principal, who: { email: string } & Principal, role: string) {
  const r = (await execute(db, by, { action: "invite", email: who.email, role: role as never, grants: [], validUntil: null })) as { token: string };
  await execute(db, who, { action: "accept", token: r.token });
  const mandate = (await db.query("SELECT id FROM role_assignment WHERE user_id=$1 AND role=$2", [who.userId, role])).rows[0].id;
  await execute(db, who, { action: "context", mandateId: mandate });
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  const a = await head(clubA, "club_president", "Présidente", true);
  [president, presidentProfile] = [a.p, a.profile];
  presidentB = (await head(clubB, "club_president", "Président B", true)).p;
  fedPresident = (await head(fed, "federation_president", "Président fédéral", false)).p;
  await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-30,CURRENT_DATE+300)", [clubA]);
  coach = await user("Nouveau Coach");
  referee = await user("Nouvel Arbitre");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("gives the invited coach his club's journey when he accepts, with a meeting in both to-dos", async () => {
  const tpl = (await run(president, { action: "adopt", key: "coach", locale: "fr" }, clubA)).id;
  const v = await onboardingView(db, president);
  const steps = v.templates.find((t) => t.id === tpl)!.steps.map((s) => (s.key === "meet" ? { ...s, ownerId: presidentProfile } : s));
  await run(president, { action: "saveTemplate", id: tpl, name: "Nouveau coach", audience: "coach", trigger: "invitation", steps }, clubA);
  // The club invites a coach it already has on file.
  await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) SELECT $1,id,'Nouveau Coach','{coach}' FROM person WHERE user_id=$2", [clubA, coach.userId]);
  await invite(president, coach, "coach");
  const mine = await onboardingView(db, coach);
  expect(mine.mine).toHaveLength(1);
  coachRun = mine.mine[0].id;
  expect(mine.mine[0].steps.map((s) => s.key)).toEqual(["welcome", "charter", "phone", "licence", "certificate", "training", "observe", "meet", "tour"]);
  expect(mine.mine[0].progress).toMatchObject({ done: 0, total: 7, next: "welcome" });
  const meet = mine.mine[0].steps.find((s) => s.key === "meet")!;
  const people = (await db.query("SELECT a.profile_id,cp.full_name FROM task_assignee a JOIN club_person cp ON cp.id=a.profile_id WHERE a.task_id=$1 ORDER BY cp.full_name", [meet.task_id])).rows.map((r) => r.full_name);
  expect(people).toEqual(["Nouveau Coach", "Présidente"]);
  // He marks the welcome read and signs the charter; a signature asks his name.
  await run(coach, { action: "done", runId: coachRun, key: "welcome" }, clubA);
  await expect(run(coach, { action: "done", runId: coachRun, key: "charter" }, clubA)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await run(coach, { action: "done", runId: coachRun, key: "charter", signedName: "Nouveau Coach" }, clubA);
  // A step that ticks by itself cannot be marked by hand.
  await expect(run(coach, { action: "done", runId: coachRun, key: "certificate" }, clubA)).rejects.toMatchObject({ code: "AUTOMATIC_STEP" });
});

it("ticks the steps by themselves: the document uploaded, the phone filled, the meeting held", async () => {
  const doc = (await onboardingView(db, coach)).mine[0].steps.find((s) => s.key === "certificate")!.document_id;
  await db.query("UPDATE club_document SET status='uploaded' WHERE id=$1", [doc]);
  await db.query("UPDATE club_person SET phone='0470 11 22 33' WHERE person_id=(SELECT id FROM person WHERE user_id=$1)", [coach.userId]);
  const meet = (await onboardingView(db, coach)).mine[0].steps.find((s) => s.key === "meet")!;
  for (const who of [coach, president]) await tasksExecute(db, who, taskCommand.parse({ action: "done", id: meet.task_id, done: true }), clubA);
  const after = (await onboardingView(db, coach)).mine[0];
  const done = (k: string) => after.steps.find((s) => s.key === k)!;
  expect([done("certificate").done_how, done("phone").done_how, done("meet").done_how]).toEqual(["auto", "auto", "auto"]);
  expect(after.progress.done).toBe(5);
});

it("reminds a late required step once a week, and the club follows who is where", async () => {
  await db.query("UPDATE onboarding_step SET due_on=CURRENT_DATE-3 WHERE run_id=$1 AND key='observe'", [coachRun]);
  const before = Number((await db.query("SELECT count(*)::int AS n FROM notification_dispatch WHERE recipient_user_id=$1", [coach.userId])).rows[0].n);
  await onboardingTick(db);
  await onboardingTick(db);
  expect(Number((await db.query("SELECT count(*)::int AS n FROM notification_dispatch WHERE recipient_user_id=$1", [coach.userId])).rows[0].n)).toBe(before + 1);
  const follow = (await onboardingView(db, president)).runs.find((r) => r.id === coachRun)!;
  expect(follow).toMatchObject({ user_name: "Nouveau Coach", status: "active" });
  expect(follow.progress).toMatchObject({ done: 5, total: 7, late: 1 });
  // The club marks the observed training; the tour seen: the journey ends.
  await run(president, { action: "mark", runId: coachRun, key: "observe", done: true }, clubA);
  await db.query("INSERT INTO user_tutorial(user_id,audience,tutorial_seen_at) VALUES($1,'coach',now())", [coach.userId]);
  await onboardingTick(db);
  expect((await onboardingView(db, president)).runs.find((r) => r.id === coachRun)!.status).toBe("done");
});

it("gives the referee his federation's journey", async () => {
  await run(fedPresident, { action: "adopt", key: "referee", locale: "fr" }, fed);
  await expect(run(fedPresident, { action: "adopt", key: "coach", locale: "fr" }, fed)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await invite(fedPresident, referee, "referee");
  const mine = (await onboardingView(db, referee)).mine;
  expect(mine.map((r) => r.name)).toEqual(["Nouvel arbitre"]);
  // Availability given: the step ticks.
  await db.query("INSERT INTO referee_availability(federation_id,user_id,day,available) VALUES($1,$2,CURRENT_DATE+10,true)", [fed, referee.userId]);
  expect((await onboardingView(db, referee)).mine[0].steps.find((s) => s.key === "availability")!.done_how).toBe("auto");
});

it("keeps another club's journeys out of sight", async () => {
  const b = await onboardingView(db, presidentB);
  expect(b.runs).toEqual([]);
  expect(b.templates).toEqual([]);
  await expect(run(presidentB, { action: "mark", runId: coachRun, key: "observe", done: false }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentB, { action: "start", templateId: (await onboardingView(db, president)).templates[0].id, userId: coach.userId }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // The coach cannot follow the others nor mark for the club.
  expect((await onboardingView(db, coach)).runs).toEqual([]);
  await expect(run(coach, { action: "mark", runId: coachRun, key: "observe", done: false }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
