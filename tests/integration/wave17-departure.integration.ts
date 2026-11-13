import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { filterSchema, peopleExecute, peopleView } from "../../src/domains/people/service";
import { publish } from "../../src/domains/notifications/queue";
import { allowed } from "../../src/domains/notifications/eligibility";
import { brusselsDay } from "../../src/lib/today";

/**
 * Wave 17 (J1): the current situation of former players (licensed in another
 * club of the federation, in another team of the club, or the reason given
 * when leaving), and « Décédé »: president only, confirmed, nothing sent.
 */
const schema = "w17dep_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let federation: string, clubA: string, clubB: string, presidentA: Principal, coachA: Principal, presidentB: Principal, seasonA: string, seasonB: string;
const day = brusselsDay();

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
const create = async (org: string, by: Principal, fullName: string) =>
  (await peopleExecute(db, by, { action: "createPerson", fullName, birthDate: "2008-03-01", email: "", phone: "", joinedOn: day, directoryRoles: ["player"] } as never, org)).id!;
const team = async (org: string, season: string, name: string) =>
  (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,$3) RETURNING id", [org, season, name])).rows[0].id as string;
const member = (org: string, teamId: string, profile: string, role = "player") =>
  db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,$4,CURRENT_DATE-10)", [org, teamId, profile, role]);
const leave = (id: string, departureStatus?: string) => peopleExecute(db, presidentA, { action: "directoryArchive", id, role: "player", archived: true, departureStatus } as never, clubA);
async function situation(id: string) {
  const view = await peopleView(db, presidentA, filterSchema.parse({ status: "all" }));
  return (view.profiles.find((p) => p.id === id) as { situation: unknown }).situation;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  federation = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [federation])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [federation])).rows[0].id;
  presidentA = await actor(clubA, "club_president");
  coachA = await actor(clubA, "coach");
  presidentB = await actor(clubB, "club_president");
  seasonA = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  seasonB = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubB])).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("says where a former player is today: another club of the federation, another team, or the reason given", async () => {
  // Licensed this season in club B, in its team « Aigles »: only the club and team names.
  const moved = await create(clubA, presidentA, "Hugo Parti");
  const person = (await db.query("SELECT person_id FROM club_person WHERE id=$1", [moved])).rows[0].person_id;
  const there = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date) VALUES($1,$2,'Hugo Parti','2008-03-01') RETURNING id", [clubB, person])).rows[0].id;
  await member(clubB, await team(clubB, seasonB, "Aigles"), there);
  await db.query("INSERT INTO license(federation_id,organization_id,profile_id,season,number,status,requested_by) VALUES($1,$2,$3,'2026-27','B-001','active',$4)", [federation, clubB, there, presidentB.userId]);
  await leave(moved, "moved");
  expect(await situation(moved)).toEqual({ kind: "club", club: "Club B", team: "Aigles" });
  // Still coaching another team of the club.
  const coach = await create(clubA, presidentA, "Léa Coach");
  await member(clubA, await team(clubA, seasonA, "Espoirs"), coach, "coach");
  await leave(coach, "stopped");
  expect(await situation(coach)).toEqual({ kind: "team", teams: ["Espoirs"] });
  // Otherwise the reason chosen in the departure window, « Inconnu » by default.
  const stopped = await create(clubA, presidentA, "Nora Stop");
  await leave(stopped, "stopped");
  expect(await situation(stopped)).toEqual({ kind: "status", status: "stopped" });
  const silent = await create(clubA, presidentA, "Sans Raison");
  await leave(silent);
  expect(await situation(silent)).toEqual({ kind: "status", status: "unknown" });
  // Changed later; another club cannot.
  await peopleExecute(db, presidentA, { action: "departure", id: silent, status: "moved", note: "Parti à Liège", confirm: false } as never, clubA);
  expect(await situation(silent)).toEqual({ kind: "status", status: "moved" });
  await expect(peopleExecute(db, presidentB, { action: "departure", id: silent, status: "stopped", note: "", confirm: false } as never, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // A current player has no situation and cannot get a reason.
  const current = await create(clubA, presidentA, "Joueur Actuel");
  expect(await situation(current)).toBeNull();
  await expect(peopleExecute(db, presidentA, { action: "departure", id: current, status: "stopped", note: "", confirm: false } as never, clubA)).rejects.toMatchObject({ code: "PROFILE_ACTIVE" });
});

it("« Décédé »: the president only, confirmed; the sheet is archived and nothing is sent any more", async () => {
  const id = await create(clubA, presidentA, "Paul Mémoire");
  const user = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,\'Paul Mémoire\',$2,true)', [user, "paul@example.test"]);
  await db.query("UPDATE person SET user_id=$2 WHERE id=(SELECT person_id FROM club_person WHERE id=$1)", [id, user]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [clubA, user]);
  await member(clubA, await team(clubA, seasonA, "Lions"), id);
  const message = (key: string) =>
    publish(db, {
      organizationId: clubA,
      userId: user,
      email: "paul@example.test",
      kind: "registration_update",
      category: "administrative",
      eventKey: key,
      resourceType: "registration",
      resourceId: randomUUID(),
      locale: "fr",
      variables: { name: "Paul", organization: "Club A", url: "/fr/registrations/mine" },
    });
  // An email already waiting.
  await message("before");
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE recipient_user_id=$1 AND state='pending'", [user])).rows[0].n).toBe(1);
  await expect(peopleExecute(db, coachA, { action: "departure", id, status: "deceased", note: "", confirm: true } as never, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(peopleExecute(db, presidentA, { action: "departure", id, status: "deceased", note: "", confirm: false } as never, clubA)).rejects.toMatchObject({ code: "CONFIRM_REQUIRED" });
  await peopleExecute(db, presidentA, { action: "departure", id, status: "deceased", note: "", confirm: true } as never, clubA);
  const row = (await db.query("SELECT status,departure_status,former_roles FROM club_person WHERE id=$1", [id])).rows[0];
  expect(row).toEqual({ status: "archived", departure_status: "deceased", former_roles: ["player"] });
  expect((await db.query("SELECT count(*)::int AS n FROM team_membership WHERE profile_id=$1 AND closed_at IS NULL", [id])).rows[0].n).toBe(0);
  expect(await situation(id)).toEqual({ kind: "deceased" });
  // The waiting email is cancelled, a new one is not even prepared, and the sender refuses any leftover.
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE recipient_user_id=$1 AND state<>'cancelled'", [user])).rows[0].n).toBe(0);
  await message("after");
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE recipient_user_id=$1", [user])).rows[0].n).toBe(1);
  expect(
    await allowed(db, { organization_id: clubA, recipient_user_id: user, resource_type: "registration", resource_id: randomUUID(), kind: "registration_update", category: "administrative" }),
  ).toBe(false);
  // No dues can be issued for the archived sheet; nor can it come back as a player.
  await expect(peopleExecute(db, presidentA, { action: "directoryArchive", id, role: "player", archived: false } as never, clubA)).rejects.toMatchObject({ code: "PROFILE_INACTIVE" });
  // Lifted by the president, with confirmation: back among the former players.
  await peopleExecute(db, presidentA, { action: "departure", id, status: "unknown", note: "", confirm: true } as never, clubA);
  expect((await db.query("SELECT status,departure_status FROM club_person WHERE id=$1", [id])).rows[0]).toEqual({ status: "inactive", departure_status: "unknown" });
});
