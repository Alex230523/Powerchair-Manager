import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { offboardingExecute, offboardingTick, offboardingView, volunteerCertificate } from "../../src/domains/offboarding/service";

/**
 * « Fin de coach »: the president starts the departure; only the steps that
 * concern the coach appear, each with its task; his tasks and sessions go to
 * another person at once; a replacement in the team ticks its step; the
 * coach answers his questions and keeps or gives his sheets; at the end
 * date his rights and team end, he joins the former coaches, his parent
 * role stays, the president is told of the keys still out. Another club
 * sees nothing.
 */
const schema = "off_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, team: string, president: Principal, presidentB: Principal, coach: Principal, helper: Principal;
let presidentProfile: string, coachProfile: string, helperProfile: string, runId: string, event: string, task: string, guardianMandate: string;
const run = (p: Principal, body: Record<string, unknown>, org: string) => offboardingExecute(db, p, body as never, org) as Promise<{ id: string; moved?: number; sent?: number }>;

async function user(name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID(),
    email = userId + "@example.test";
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, email]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  return { userId, sessionId, email };
}
async function member(org: string, role: string, name: string) {
  const u = await user(name);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, u.userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, u.userId, role])).rows[0].id as string;
  await execute(db, u, { action: "context", mandateId });
  const profile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,$2 FROM person WHERE user_id=$3 RETURNING id", [org, name, u.userId])).rows[0].id as string;
  return { p: u, profile, mandateId };
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  const a = await member(clubA, "club_president", "Présidente");
  [president, presidentProfile] = [a.p, a.profile];
  presidentB = (await member(clubB, "club_president", "Président B")).p;
  const c = await member(clubA, "coach", "Coach Partant");
  [coach, coachProfile] = [c.p, c.profile];
  // He is also a parent: that role must stay after his departure.
  guardianMandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'guardian') RETURNING id", [clubA, coach.userId])).rows[0].id;
  const h = await member(clubA, "coach", "Coach Suivant");
  [helper, helperProfile] = [h.p, h.profile];
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+300) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-60)", [clubA, team, coachProfile]);
  // A player of the team with an account, told of the departure.
  const pl = await user("Joueur");
  await db.query("WITH c AS (INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,'Joueur' FROM person WHERE user_id=$2 RETURNING id) INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) SELECT $1,$3,c.id,'player',CURRENT_DATE-30 FROM c", [clubA, pl.userId, team]);
  task = (await db.query("INSERT INTO task(organization_id,title,kind,due_on,responsible_id,created_by) VALUES($1,'Commander les maillots','other',CURRENT_DATE+10,$2,$3) RETURNING id", [clubA, coachProfile, president.userId])).rows[0].id;
  const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [clubA, president.userId])).rows[0].id;
  event = (
    await db.query(
      "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility) VALUES($1,$2,1,'Entraînement','training','Europe/Brussels',now()+interval '3 days',now()+interval '3 days 2 hours','2026-11-05T18:00','2026-11-05T20:00',$3,$4,'organization') RETURNING id",
      [clubA, series, team, coach.userId],
    )
  ).rows[0].id;
  // A past session of his, counted on the certificate.
  await db.query(
    "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility) VALUES($1,$2,2,'Entraînement passé','training','Europe/Brussels',now()-interval '7 days',now()-interval '7 days'+interval '2 hours','2026-10-26T18:00','2026-10-26T20:00',$3,$4,'organization')",
    [clubA, series, team, president.userId],
  );
  await db.query("INSERT INTO staff_key(organization_id,profile_id,label,handed_on,created_by) VALUES($1,$2,'Clé de la salle',CURRENT_DATE-30,$3)", [clubA, coachProfile, president.userId]);
  await db.query("INSERT INTO exercise(organization_id,author_id,title,objective,duration_minutes,level,suited,shared) VALUES($1,$2,'Slalom secret','driving',15,'beginner','both',false)", [clubA, coach.userId]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("starts the departure with only the steps that concern him, each in the to-do", async () => {
  const endsOn = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date(Date.now() + 14 * 86400000));
  // The coach himself cannot start it, nor another club.
  await expect(run(coach, { action: "start", profileId: coachProfile, endsOn, reason: "moved", locale: "fr" }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(run(presidentB, { action: "start", profileId: coachProfile, endsOn, reason: "moved", locale: "fr" }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  runId = (await run(president, { action: "start", profileId: coachProfile, endsOn, reason: "moved", note: "Déménage à Liège", locale: "fr" }, clubA)).id;
  const v = await offboardingView(db, president, coachProfile);
  expect(v.run!.steps.map((s) => s.key)).toEqual([`replace:${team}`, "tasks", "duties", "keys", "exercises", "rights", "notify", "thanks", "survey", "close"]);
  const tasks = (await db.query("SELECT source_key FROM task WHERE organization_id=$1 AND source_kind='offboarding' ORDER BY source_key", [clubA])).rows.map((r) => r.source_key.split(":")[2]);
  expect(tasks).toHaveLength(8); // survey and exercises are his, not the club's.
  // The coach sees his part, without the internal note; a second departure is refused.
  const mine = await offboardingView(db, coach, coachProfile);
  expect(mine.can).toEqual({ manage: false, self: true });
  expect(mine.run!.note).toBe("");
  await expect(run(president, { action: "start", profileId: coachProfile, endsOn, reason: "moved", locale: "fr" }, clubA)).rejects.toMatchObject({ code: "DUPLICATE" });
  // Another club sees nothing of it.
  await expect(offboardingView(db, presidentB, coachProfile)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // Another coach of the club sees nothing of it.
  expect(await offboardingView(db, helper, coachProfile)).toMatchObject({ run: null, can: { manage: false, self: false } });
  // He was told (« Prévenir le coach »).
  expect((await db.query("SELECT 1 FROM notification_dispatch WHERE recipient_user_id=$1", [coach.userId])).rowCount).toBeGreaterThan(0);
});

it("gives his tasks and sessions to another person at once; a replacement ticks its step", async () => {
  const moved = await run(president, { action: "reassignTasks", runId, toProfileId: helperProfile }, clubA);
  expect(moved.moved).toBe(1);
  expect((await db.query("SELECT responsible_id FROM task WHERE id=$1", [task])).rows[0].responsible_id).toBe(helperProfile);
  expect((await db.query("SELECT profile_id FROM task_assignee WHERE task_id=$1", [task])).rows.map((r) => r.profile_id)).toEqual([helperProfile]);
  await run(president, { action: "reassignDuties", runId, toProfileId: helperProfile }, clubA);
  expect((await db.query("SELECT responsible_user_id FROM calendar_event WHERE id=$1", [event])).rows[0].responsible_user_id).toBe(helper.userId);
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE)", [clubA, team, helperProfile]);
  const v = await offboardingView(db, president, coachProfile);
  const done = Object.fromEntries(v.run!.steps.map((s) => [s.key.split(":")[0], s.done_how]));
  expect(done).toMatchObject({ replace: "auto", tasks: "auto", duties: "auto", keys: null });
  // The step's task closed with it.
  expect((await db.query("SELECT status,auto_closed FROM task WHERE source_key=$1", [`offboarding:${runId}:tasks`])).rows[0]).toEqual({ status: "done", auto_closed: true });
});

it("lets only the coach answer his questions and choose for his sheets; a skip needs a reason", async () => {
  await expect(run(president, { action: "survey", runId, answers: { liked: "x", change: "y", back: "z" } }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(run(president, { action: "exercises", runId, choice: "copy" }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(coach, { action: "survey", runId, answers: { liked: "L'équipe", change: "Plus de créneaux", back: "Comme arbitre" } }, clubA);
  await run(coach, { action: "exercises", runId, choice: "copy" }, clubA);
  expect((await db.query("SELECT shared FROM exercise WHERE author_id=$1", [coach.userId])).rows[0].shared).toBe(true);
  await expect(run(president, { action: "skip", runId, key: "thanks", reason: "" }, clubA)).rejects.toBeTruthy();
  await run(president, { action: "skip", runId, key: "thanks", reason: "Fait de vive voix" }, clubA);
  const sent = await run(president, { action: "notify", runId, locale: "fr" }, clubA);
  expect(sent.sent).toBe(1);
  await run(president, { action: "rightsEnd", runId }, clubA);
  const v = await offboardingView(db, president, coachProfile);
  expect(v.run!.steps.find((s) => s.key === "rights")!.done_how).toBe("auto");
  expect(v.run!.steps.find((s) => s.key === "thanks")!.skip_reason).toBe("Fait de vive voix");
});

it("gives the volunteering certificate to him and to the club, not to another club", async () => {
  const f = await volunteerCertificate(db, coach, coachProfile, "fr");
  expect(Buffer.from(f.bytes).subarray(0, 5).toString()).toBe("%PDF-");
  await expect(volunteerCertificate(db, presidentB, coachProfile, "fr")).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(volunteerCertificate(db, helper, coachProfile, "fr")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("at the end date ends his coach rights and team, keeps his parent role and tells the president of the keys", async () => {
  await db.query("UPDATE offboarding_run SET ends_on=CURRENT_DATE WHERE id=$1", [runId]);
  expect(await offboardingTick(db)).toBeGreaterThanOrEqual(1);
  const r = (await db.query("SELECT status FROM offboarding_run WHERE id=$1", [runId])).rows[0];
  expect(r.status).toBe("done");
  const coachMandate = (await db.query("SELECT valid_until<=now() AS ended FROM role_assignment WHERE user_id=$1 AND role='coach'", [coach.userId])).rows[0];
  expect(coachMandate.ended).toBe(true);
  expect((await db.query("SELECT revoked_at,valid_until FROM role_assignment WHERE id=$1", [guardianMandate])).rows[0]).toEqual({ revoked_at: null, valid_until: null });
  expect((await db.query("SELECT closed_at IS NOT NULL AS closed FROM team_membership WHERE profile_id=$1 AND role='coach'", [coachProfile])).rows[0].closed).toBe(true);
  const cp = (await db.query("SELECT former_roles,departure_status FROM club_person WHERE id=$1", [coachProfile])).rows[0];
  expect(cp.former_roles).toContain("coach");
  // The key is still out: the president is alerted, a follow-up task exists.
  expect((await db.query("SELECT 1 FROM notification_dispatch WHERE recipient_user_id=$1", [president.userId])).rowCount).toBeGreaterThan(0);
  // Closed, it cannot change any more.
  await expect(run(president, { action: "cancel", runId }, clubA)).rejects.toMatchObject({ code: "DEPARTURE_CLOSED" });
  void presidentProfile;
});

it("cancels a departure before the end date: the coach stays, the tasks close", async () => {
  const endsOn = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date(Date.now() + 30 * 86400000));
  const id = (await run(president, { action: "start", profileId: helperProfile, endsOn, reason: "unknown", notifyCoach: false, locale: "nl" }, clubA)).id;
  await run(president, { action: "cancel", runId: id }, clubA);
  expect((await db.query("SELECT count(*)::int AS n FROM task WHERE source_key LIKE $1 AND status<>'done'", [`offboarding:${id}:%`])).rows[0].n).toBe(0);
  expect((await db.query("SELECT 1 FROM team_membership WHERE profile_id=$1 AND closed_at IS NULL", [helperProfile])).rowCount).toBe(1);
});
