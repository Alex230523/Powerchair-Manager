import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { attendanceExecute, attendanceView, commandSchema } from "../../src/domains/attendance/service";
import { playerSummaries } from "../../src/domains/attendance/rollcall";
import { undoExecute } from "../../src/domains/undo/service";
import { brusselsDay } from "../../src/lib/today";

/**
 * Wave 17 (J2), in two clubs: « Excusé » prefilled by an announced absence
 * and counted apart, « Tout présent » and each mark undone, the coach's
 * own roll call, a correction after closing that needs a reason.
 */
const schema = "w17att_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, coach: Principal, presidentB: Principal, team: string;
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
/** A future training of the team, invited, then moved to the past to take the roll. */
async function session(title: string, kind = "training") {
  const start = new Date(Date.now() + 3 * 86400000);
  const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [clubA, president.userId])).rows[0].id;
  const event = (
    await db.query(
      "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility) VALUES($1,$8,1,$2,$3,'Europe/Brussels',$4,$5,'2026-01-01T18:00','2026-01-01T20:00',$6,$7,'team') RETURNING id",
      [clubA, title, kind, start, new Date(start.getTime() + 7200000), team, president.userId, series],
    )
  ).rows[0].id as string;
  await run(president, { action: "invite", eventId: event, expectedVersion: null, profiles: players, deadline: new Date(Date.now() + 86400000).toISOString(), minimum: 0 });
  await db.query("UPDATE calendar_event SET starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' WHERE id=$1", [event]);
  return (await db.query("SELECT id FROM attendance_register WHERE event_id=$1", [event])).rows[0].id as string;
}
const marks = async (register: string) =>
  Object.fromEntries(
    (await db.query("SELECT c.full_name,i.actual FROM attendance_invitation i JOIN club_person c ON c.id=i.profile_id WHERE i.register_id=$1", [register])).rows.map((r) => [r.full_name, r.actual]),
  );
const invitationOf = async (register: string, name: string) =>
  (await db.query("SELECT i.id,i.version FROM attendance_invitation i JOIN club_person c ON c.id=i.profile_id WHERE i.register_id=$1 AND c.full_name=$2", [register, name])).rows[0] as { id: string; version: number };
const version = async (register: string) => (await db.query("SELECT version FROM attendance_register WHERE id=$1", [register])).rows[0].version as number;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = await actor(clubA, "club_president");
  coach = await actor(clubA, "coach", ["attendance.manage", "calendar.read"]);
  presidentB = await actor(clubB, "club_president");
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Les Aigles') RETURNING id", [clubA, season])).rows[0].id;
  for (const name of ["Ana", "Bilal", "Chloé"]) {
    const id = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date) SELECT $1,id,$2,'2010-01-01' FROM p RETURNING id", [clubA, name])).rows[0].id;
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubA, team, id]);
    players.push(id);
  }
  // Chloé announced her absence for the next days.
  await db.query("INSERT INTO absence_period(organization_id,profile_id,starts_on,ends_on,reason,declared_by) VALUES($1,$2,CURRENT_DATE,CURRENT_DATE+10,'illness',$3)", [clubA, players[2], president.userId]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("prefills « Excusé » for an announced absence, marks everyone else with « Tout présent », and undoes it", async () => {
  const r = await session("Entraînement du mardi");
  expect(await marks(r)).toEqual({ Ana: "unchecked", Bilal: "unchecked", Chloé: "excused" });
  // The coach takes the roll: everyone not yet marked becomes present.
  const all = (await run(coach, { action: "markAll", id: r, expectedVersion: await version(r) })) as { count: number; undo: string };
  expect(all.count).toBe(2);
  expect(await marks(r)).toEqual({ Ana: "present", Bilal: "present", Chloé: "excused" });
  await undoExecute(db, coach, { id: all.undo }, clubA);
  expect(await marks(r)).toEqual({ Ana: "unchecked", Bilal: "unchecked", Chloé: "excused" });
  // One click, one undo; the other club cannot touch the register.
  const ana = await invitationOf(r, "Ana");
  const one = (await run(coach, { action: "mark", id: ana.id, expectedVersion: ana.version, actual: "absent", reason: "" })) as { undo: string };
  expect((await marks(r)).Ana).toBe("absent");
  await undoExecute(db, coach, { id: one.undo }, clubA);
  expect((await marks(r)).Ana).toBe("unchecked");
  await expect(run(presidentB, { action: "markAll", id: r, expectedVersion: await version(r) }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(undoExecute(db, presidentB, { id: one.undo }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const history = (await db.query("SELECT action FROM attendance_history WHERE register_id=$1 ORDER BY created_at", [r])).rows.map((h) => h.action);
  expect(history).toEqual(expect.arrayContaining(["mark_all", "undo", "mark"]));
});

it("asks a reason for a correction after closing, and counts « Excusé » apart", async () => {
  const r = await session("Match amical", "friendly");
  await run(president, { action: "markAll", id: r, expectedVersion: await version(r) });
  await run(president, { action: "close", id: r, expectedVersion: await version(r) });
  const bilal = await invitationOf(r, "Bilal");
  await expect(run(president, { action: "mark", id: bilal.id, expectedVersion: bilal.version, actual: "late", reason: "" })).rejects.toMatchObject({ code: "CORRECTION_REASON" });
  await run(president, { action: "mark", id: bilal.id, expectedVersion: bilal.version, actual: "late", reason: "Arrivé à 18 h 20" });
  expect((await db.query("SELECT reason FROM attendance_history WHERE invitation_id=$1 AND action='mark'", [bilal.id])).rows[0].reason).toBe("Arrivé à 18 h 20");
  // The first session is closed too, with Ana absent.
  const first = (await db.query("SELECT r.id FROM attendance_register r JOIN calendar_event e ON e.id=r.event_id WHERE e.title='Entraînement du mardi'")).rows[0].id;
  const ana = await invitationOf(first, "Ana");
  await run(president, { action: "mark", id: ana.id, expectedVersion: ana.version, actual: "absent", reason: "" });
  await run(president, { action: "markAll", id: first, expectedVersion: await version(first) });
  await run(president, { action: "close", id: first, expectedVersion: await version(first) });
  const day = brusselsDay();
  const view = await attendanceView(db, president, brusselsDay(new Date(Date.now() - 86400000)), day);
  const byName = Object.fromEntries(playerSummaries(view.events).map((s) => [s.name, s]));
  expect(byName.Ana).toMatchObject({ training: { attended: 0, closed: 1 }, match: { attended: 1, closed: 1 }, absent: 1, excused: 0, rate: 50 });
  expect(byName.Bilal).toMatchObject({ training: { attended: 1, closed: 1 }, match: { attended: 1, closed: 1 }, rate: 100 });
  expect(byName.Chloé).toMatchObject({ training: { attended: 0, closed: 1 }, match: { attended: 0, closed: 1 }, excused: 2, absent: 0, rate: 0 });
  // The server's per-kind statistics count « Excusé » apart as well.
  expect(view.stats.find((s) => s.name === "Chloé" && s.kind === "training")).toMatchObject({ excused: 1, absent: 0 });
  // Club B sees nothing of it.
  expect((await attendanceView(db, presidentB, brusselsDay(new Date(Date.now() - 86400000)), day)).events).toEqual([]);
});
