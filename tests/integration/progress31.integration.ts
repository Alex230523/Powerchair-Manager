import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { progressCommand, progressExecute, progressView } from "../../src/domains/progress/service";

/**
 * 31: « Mon suivi ». An objective set then acquired, five at most; a
 * proposal by the player; the season's numbers against last season's; a
 * feedback the player is told about, sees and answers; the private note
 * never shown to the player nor his parent; the parent reads his child's
 * follow-up; the president reads without writing; a former coach, another
 * player and another club refused.
 */
const schema = "prog_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, team: string, president: Principal, coach: Principal, former: Principal, ana: Principal, bilal: Principal, parent: Principal, presidentB: Principal;
let anaProfile: string, user: string;

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
async function profile(person: string, name: string, roles: string, birth: string | null = null) {
  return (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,$4,$5) RETURNING id", [clubA, person, name, birth, roles])).rows[0].id as string;
}
const member = (profileId: string, role: string, closed = false) =>
  db.query(`INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on${closed ? ",closed_at" : ""}) VALUES($1,$2,$3,$4,CURRENT_DATE-200${closed ? ",now()-interval '10 days'" : ""})`, [
    clubA,
    team,
    profileId,
    role,
  ]);
/** A training or a match on a given day, with the player's presence seen on the day. */
async function session(day: string, actual: string, match = false) {
  const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [clubA, user])).rows[0].id;
  const event = (
    await db.query(
      `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,responsible_user_id,visibility)
       VALUES($1,$2,1,$3,$4,'Europe/Brussels',$5::date+time '18:00',$5::date+time '20:00',$5||'T18:00',$5||'T20:00',$6,'organization') RETURNING id`,
      [clubA, series, match ? "Match" : "Entraînement", match ? "friendly" : "training", day, user],
    )
  ).rows[0].id;
  const register = (await db.query("INSERT INTO attendance_register(organization_id,event_id,deadline) VALUES($1,$2,$3::date) RETURNING id", [clubA, event, day])).rows[0].id;
  await db.query("INSERT INTO attendance_invitation(organization_id,register_id,profile_id,actual) VALUES($1,$2,$3,$4)", [clubA, register, anaProfile, actual]);
  if (match) {
    const m = (
      await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,calendar_event_id,status,our_score,their_score,created_by) VALUES($1,$2,'Lions','league',$3::date+time '18:00',$4,'played',2,1,$5) RETURNING id", [
        clubA,
        team,
        day,
        event,
        user,
      ])
    ).rows[0].id;
    await db.query("INSERT INTO match_player(match_id,organization_id,profile_id,minutes,goals,assists,yellow_cards) VALUES($1,$2,$3,30,1,1,1)", [m, clubA, anaProfile]);
    return { event, match: m as string };
  }
  return { event, match: null };
}
const ago = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const run = (p: Principal, cmd: Record<string, unknown>, org = clubA) => progressExecute(db, p, progressCommand.parse(cmd), org) as Promise<{ id: string; told?: number }>;
const goal = (title: string, extra: Record<string, unknown> = {}) => ({ action: "goalCreate", profileId: anaProfile, category: "driving", title, detail: "", ...extra });

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  const pr = await actor(clubA, "club_president", "Présidente");
  president = pr.p;
  user = president.userId;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-400,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  const c = await actor(clubA, "coach", "Coach Lina", team);
  coach = c.p;
  await member(await profile(c.person, "Coach Lina", "{coach}"), "coach");
  const f = await actor(clubA, "coach", "Ancien coach");
  former = f.p;
  await member(await profile(f.person, "Ancien coach", "{coach}"), "coach", true);
  const a = await actor(clubA, "player", "Ana");
  ana = a.p;
  anaProfile = await profile(a.person, "Ana Martin", "{player}", "2012-04-01");
  await member(anaProfile, "player");
  const b = await actor(clubA, "player", "Bilal");
  bilal = b.p;
  await member(await profile(b.person, "Bilal", "{player}", "2011-01-01"), "player");
  const pa = await actor(clubA, "guardian", "Sophie Martin");
  parent = pa.p;
  const guardian = await profile(pa.person, "Sophie Martin", "{}");
  await db.query(
    "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,false,'Vérifié pour le test',$4)",
    [clubA, guardian, anaProfile, user],
  );
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("lets the coach set an objective then mark it acquired, five at most per period", async () => {
  const id = (await run(coach, goal("Demi-tour serré sans toucher le plot"))).id;
  await run(coach, { action: "goalStatus", id, status: "progressing" });
  await run(coach, { action: "goalStatus", id, status: "acquired" });
  const v = await progressView(db, coach, anaProfile);
  expect(v.goals.map((g) => [g.title, g.status, g.state, !!g.acquired_at])).toEqual([["Demi-tour serré sans toucher le plot", "acquired", "active", true]]);
  for (const t of ["Regard haut", "Passe longue", "Placement défensif", "Encourager"]) await run(coach, goal(t));
  await expect(run(coach, goal("Sixième"))).rejects.toMatchObject({ code: "TOO_MANY_GOALS" });
  // Another period has room.
  await run(coach, goal("Objectif de printemps", { period: "Printemps" }));
});

it("lets the player propose an objective, which the coach keeps or not", async () => {
  // The current period is full: the player proposes in vain, the coach frees a place.
  await expect(run(ana, { action: "goalPropose", profileId: anaProfile, category: "tactics", title: "Jouer libéro" })).rejects.toMatchObject({ code: "TOO_MANY_GOALS" });
  const encourager = (await progressView(db, coach, anaProfile)).goals.find((g) => g.title === "Encourager")!;
  await run(coach, { action: "goalDelete", id: encourager.id });
  const id = (await run(ana, { action: "goalPropose", profileId: anaProfile, category: "tactics", title: "Jouer libéro" })).id;
  expect((await progressView(db, ana, anaProfile)).goals.find((g) => g.id === id)).toMatchObject({ state: "proposed" });
  await expect(run(ana, { action: "goalStatus", id, status: "acquired" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(coach, { action: "goalDecide", id, accept: true });
  expect((await progressView(db, ana, anaProfile)).goals.find((g) => g.id === id)).toMatchObject({ state: "active", status: "to_work" });
});

it("gives the season's numbers next to last season's, without other players", async () => {
  await session(ago(20), "present");
  await session(ago(13), "absent");
  await session(ago(6), "present");
  await session(ago(5), "late");
  await session(ago(3), "present", true);
  await session(ago(400), "present");
  const v = await progressView(db, ana, anaProfile);
  expect(v.season.now.trainings).toEqual({ invited: 4, present: 3, rate: 75, streak: 2 });
  expect(v.season.now.matches).toEqual({ invited: 1, present: 1, rate: 100, streak: 1 });
  expect(v.season.now).toMatchObject({ played: 1, minutes: 30, goals: 1, assists: 1, yellow: 1, red: 0 });
  expect(v.season.before.trainings).toMatchObject({ invited: 1, present: 1 });
  expect(JSON.stringify(v)).not.toContain("Bilal");
});

it("sends a feedback the player is told about, sees and answers; the private note stays with the coaches", async () => {
  const last = (await progressView(db, coach, anaProfile)).sessions.find((s) => s.match_id)!;
  const fb = await run(coach, { action: "feedbackCreate", profileId: anaProfile, body: "Très bon placement en défense.", eventId: last.id, matchId: last.match_id });
  expect(fb.told).toBe(1);
  expect((await db.query("SELECT count(*)::int AS n FROM app_notification WHERE recipient_user_id=$1 AND resource_id=$2", [ana.userId, `feedback:${fb.id}`])).rows[0].n).toBe(1);
  await run(coach, { action: "noteCreate", profileId: anaProfile, body: "Fatigue en fin de séance, à surveiller." });
  const seen = await progressView(db, ana, anaProfile);
  expect(seen.access).toBe("self");
  expect(seen.notes).toBeNull();
  expect(JSON.stringify(seen)).not.toContain("Fatigue");
  expect(seen.feedback[0]).toMatchObject({ body: "Très bon placement en défense.", about: "Lions", author: "Coach Lina", seen_at: null });
  await run(ana, { action: "feedbackSeen", id: fb.id });
  await run(ana, { action: "feedbackReact", id: fb.id, reaction: "Merci coach !" });
  const back = await progressView(db, coach, anaProfile);
  expect(back.feedback[0]).toMatchObject({ reaction: "Merci coach !" });
  expect(back.feedback[0].seen_at).toBeTruthy();
  expect(back.notes?.map((n) => n.body)).toEqual(["Fatigue en fin de séance, à surveiller."]);
  // The player cannot write feedback nor notes.
  await expect(run(ana, { action: "noteCreate", profileId: anaProfile, body: "Moi aussi" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(run(ana, { action: "feedbackCreate", profileId: anaProfile, body: "Je me note" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("lets the parent read his child's follow-up, without the private notes", async () => {
  const v = await progressView(db, parent, anaProfile);
  expect(v.access).toBe("parent");
  expect(v.can).toEqual({ write: false, propose: true, react: true });
  expect(v.notes).toBeNull();
  expect(JSON.stringify(v)).not.toContain("Fatigue");
  expect(v.feedback).toHaveLength(1);
});

it("lets the president read without writing, and refuses a former coach, another player and another club", async () => {
  const v = await progressView(db, president, anaProfile);
  expect(v.access).toBe("president");
  expect(v.notes).toBeNull();
  await expect(run(president, goal("Par la présidente"))).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(progressView(db, former, anaProfile)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(progressView(db, bilal, anaProfile)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(progressView(db, presidentB, anaProfile)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const note = (await progressView(db, coach, anaProfile)).notes![0].id;
  await expect(run(presidentB, { action: "noteDelete", id: note }, clubB)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
