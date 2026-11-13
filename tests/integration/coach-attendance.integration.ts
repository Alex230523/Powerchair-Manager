import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { attendanceExecute, attendanceTick, attendanceView, commandSchema } from "../../src/domains/attendance/service";
import { myUpcoming, playerSummaries } from "../../src/domains/attendance/rollcall";
import { coachFocus } from "../../src/domains/dashboard/focus";

/**
 * 13/11/2026, in two clubs: the coaches give their attendance at the
 * trainings. The coach is invited with his team, answers for himself (never
 * for a player), is shown apart (« Coachs »), and never weighs on the
 * players' figures: the minimum, the rates, the answers of the home.
 */
const schema = "coachatt_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, coach: Principal, presidentB: Principal, team: string, coachProfile: string, assistantProfile: string;
const players: string[] = [];

async function actor(org: string, role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const run = (p: Principal, cmd: unknown, org = clubA) => attendanceExecute(db, p, commandSchema.parse(cmd), org);
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
async function training(title: string, inDays = 3, kind = "training") {
  const start = new Date(Date.now() + inDays * 86400000);
  const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [clubA, president.userId])).rows[0].id;
  const event = (
    await db.query(
      "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility) VALUES($1,$8,1,$2,$3,'Europe/Brussels',$4,$5,'2026-01-01T18:00','2026-01-01T20:00',$6,$7,'team') RETURNING id",
      [clubA, title, kind, start, new Date(start.getTime() + 7200000), team, president.userId, series],
    )
  ).rows[0].id as string;
  await run(president, { action: "invite", eventId: event, expectedVersion: null, profiles: [...players, coachProfile, assistantProfile], deadline: new Date(start.getTime() - 3600000).toISOString(), minimum: 0 });
  return event;
}
const viewOf = async (p: Principal) => (await attendanceView(db, p, day(-2), day(10))).events;
const mineIn = async (p: Principal, event: string) => (await viewOf(p)).find((e) => e.id === event)!.invitations;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = await actor(clubA, "club_president");
  coach = await actor(clubA, "coach");
  presidentB = await actor(clubB, "club_president");
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Les Aigles') RETURNING id", [clubA, season])).rows[0].id;
  for (const name of ["Ana", "Bilal"]) {
    const id = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date) SELECT $1,id,$2,'2010-01-01' FROM p RETURNING id", [clubA, name])).rows[0].id;
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubA, team, id]);
    players.push(id);
  }
  // The coach's own sheet, linked to his account, and an assistant without an account.
  coachProfile = (
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,(SELECT id FROM person WHERE user_id=$2),'Coach Léo','{coach}') RETURNING id", [clubA, coach.userId])
  ).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-30)", [clubA, team, coachProfile]);
  assistantProfile = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,'Assistante Mia' FROM p RETURNING id", [clubA])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'assistant',CURRENT_DATE-30)", [clubA, team, assistantProfile]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("invites the coach with his team; he answers for himself, never for a player, shown apart", async () => {
  const event = await training("Entraînement du jeudi");
  const list = await mineIn(coach, event);
  const by = Object.fromEntries(list.map((i) => [i.full_name, i]));
  // The coach sees the whole register (he takes the roll) and his own line, apart.
  expect(Object.keys(by).sort()).toEqual(["Ana", "Assistante Mia", "Bilal", "Coach Léo"]);
  expect(by["Coach Léo"]).toMatchObject({ staff: true, self: true, canRespond: true });
  expect(by["Assistante Mia"]).toMatchObject({ staff: true, self: false, canRespond: false });
  expect(by.Ana).toMatchObject({ staff: false, self: false, canRespond: false });
  // « Mes prochaines séances »: his own line only.
  const upcoming = myUpcoming(await viewOf(coach), Date.now());
  expect(upcoming.map((u) => u.invitation.full_name)).toEqual(["Coach Léo"]);
  await run(coach, { action: "respond", id: by["Coach Léo"].id, expectedVersion: by["Coach Léo"].version, response: "present", comment: "" });
  expect((await mineIn(coach, event)).find((i) => i.full_name === "Coach Léo")).toMatchObject({ response: "present" });
  // Never for a player, never from another club.
  await expect(run(coach, { action: "respond", id: by.Ana.id, expectedVersion: by.Ana.version, response: "absent", comment: "", absenceReason: "other" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  const mine = (await mineIn(coach, event)).find((i) => i.full_name === "Coach Léo")!;
  await expect(run(presidentB, { action: "respond", id: mine.id, expectedVersion: mine.version, response: "absent", comment: "", absenceReason: "other" }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // The president sees the coach's answer, and nobody's line is marked as his own.
  expect((await mineIn(president, event)).filter((i) => i.self)).toEqual([]);
});

it("shows the coach's own answer on his home, the players' answers counted apart", async () => {
  const c = await db.connect();
  try {
    const focus = await coachFocus(c, clubA, [coachProfile]);
    const next = focus.teams[0].nextTraining!;
    expect(next.title).toBe("Entraînement du jeudi");
    expect(next).toMatchObject({ invited: 2, answered: 0, present: 0, staff: { invited: 2, present: 1 } });
    expect(next.mine).toMatchObject({ response: "present", open: true });
  } finally {
    c.release();
  }
});

it("keeps the coaches out of the minimum and out of the players' rates", async () => {
  const event = await training("Entraînement avec minimum", 4);
  const register = (await db.query("SELECT id,version FROM attendance_register WHERE event_id=$1", [event])).rows[0];
  await db.query("UPDATE attendance_register SET minimum=1 WHERE id=$1", [register.id]);
  const coachLine = (await mineIn(coach, event)).find((i) => i.full_name === "Coach Léo")!;
  await run(coach, { action: "respond", id: coachLine.id, expectedVersion: coachLine.version, response: "present", comment: "" });
  // The deadline passes: one coach present, no player: below the minimum.
  await db.query("UPDATE attendance_register SET deadline=now()-interval '1 minute' WHERE id=$1", [register.id]);
  await attendanceTick(db, [clubA]);
  const check = (await db.query("SELECT after_data FROM attendance_history WHERE register_id=$1 AND action='threshold_check'", [register.id])).rows[0].after_data;
  expect(check).toMatchObject({ confirmed: 0, minimum: 1, alerted: true });

  // The session takes place, the roll is taken and closed.
  await db.query("UPDATE calendar_event SET starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' WHERE id=$1", [event]);
  const v = (await db.query("SELECT version FROM attendance_register WHERE id=$1", [register.id])).rows[0].version;
  await run(coach, { action: "markAll", id: register.id, expectedVersion: v });
  await run(coach, { action: "close", id: register.id, expectedVersion: v + 1 });
  const events = await viewOf(president);
  expect(playerSummaries(events).map((s) => s.name).sort()).toEqual(["Ana", "Bilal"]);
  expect(playerSummaries(events, true).map((s) => s.name).sort()).toEqual(["Assistante Mia", "Coach Léo"]);
  expect(playerSummaries(events, true).find((s) => s.name === "Coach Léo")).toMatchObject({ training: { attended: 1, closed: 1 }, rate: 100 });
  // Club B sees nothing of it.
  expect((await attendanceView(db, presidentB, day(-2), day(10))).events).toEqual([]);
});
