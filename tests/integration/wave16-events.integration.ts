import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { calendarExecute, calendarView, eventTypesView } from "../../src/domains/calendar/service";
import { attendanceExecute } from "../../src/domains/attendance/service";
import { undoExecute } from "../../src/domains/undo/service";

/** Wave 16 (E1): club event types, invitations by group, delete, trips, in two clubs. */
const schema = "w16ev_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, coachA: Principal, parent: Principal, presidentB: Principal;
let lions: string, zoe: string, yanis: string, coachProfile: string, parentProfile: string, groupId: string;

async function actor(org: string, role: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Test " + role, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person: person as string };
}
const profile = async (org: string, name: string, birth: string | null, roles: string[], person?: string) =>
  (
    await db.query(
      `WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,COALESCE($5::uuid,p.id),$2,$3,$4 FROM p RETURNING id`,
      [org, name, birth, roles, person ?? null],
    )
  ).rows[0].id as string;
const day = (n: number) => {
  const d = new Date(Date.now() + n * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);
};
const typeId = async (org: string, name: string) => (await db.query("SELECT id FROM event_type WHERE organization_id=$1 AND name=$2", [org, name])).rows[0].id as string;
const event = (by: Principal, org: string, extra: Record<string, unknown>) =>
  calendarExecute(
    db,
    by,
    {
      action: "create",
      title: "Entraînement",
      kind: "training",
      customType: "",
      timezone: "Europe/Brussels",
      localStart: `${day(5)}T18:00`,
      localEnd: `${day(5)}T20:00`,
      fold: "reject",
      teamId: lions,
      placeId: null,
      responsibleId: by.userId,
      visibility: "team",
      equipment: "",
      instructions: "",
      participants: [],
      documents: [],
      intervalDays: 0,
      occurrences: 1,
      requestId: randomUUID(),
      ...extra,
    } as never,
    org,
  ) as Promise<{ id: string; undo?: string }>;
const invitations = async (eventId: string) =>
  (
    await db.query("SELECT i.id,i.profile_id,i.version FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id WHERE r.event_id=$1 AND i.withdrawn_at IS NULL ORDER BY i.profile_id", [eventId])
  ).rows as { id: string; profile_id: string; version: number }[];
const participants = async (eventId: string) => (await db.query("SELECT profile_id FROM calendar_participant WHERE event_id=$1", [eventId])).rows.map((r) => r.profile_id as string).sort();

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = (await actor(clubA, "club_president")).p;
  presidentB = (await actor(clubB, "club_president")).p;
  const coach = await actor(clubA, "coach");
  coachA = coach.p;
  const parentActor = await actor(clubA, "guardian");
  parent = parentActor.p;
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  lions = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions') RETURNING id", [clubA, season])).rows[0].id;
  zoe = await profile(clubA, "Zoé Enfant", "2014-01-01", ["player"]);
  yanis = await profile(clubA, "Yanis Joueur", "2000-01-01", ["player"]);
  coachProfile = await profile(clubA, "Coach Lions", "1980-01-01", ["coach"], coach.person);
  parentProfile = await profile(clubA, "Parent Zoé", null, [], parentActor.person);
  for (const [p, role] of [
    [zoe, "player"],
    [yanis, "player"],
    [coachProfile, "coach"],
  ])
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,$4,CURRENT_DATE-1)", [clubA, lions, p, role]);
  await db.query(
    "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,'Parent légal',$4)",
    [clubA, parentProfile, zoe, presidentA.userId],
  );
  groupId = (await db.query("INSERT INTO recipient_group(organization_id,name,audiences,profile_ids,created_by) VALUES($1,'Bureau','{}',$2,$3) RETURNING id", [clubA, [yanis], presidentA.userId])).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("gives every club its own editable types, each with a family", async () => {
  const a = await eventTypesView(db, presidentA);
  expect(a.types.map((t) => [t.name, t.family])).toEqual([
    ["Entraînement", "training"],
    ["Match amical", "match"],
    ["Match de championnat", "match"],
    ["Tournoi", "match"],
    ["Teambuilding", "other"],
    ["Réunion administrative", "meeting"],
    ["Assemblée générale", "meeting"],
    ["Stage", "training"],
    ["Autre", "other"],
  ]);
  expect((await eventTypesView(db, presidentB)).types.map((t) => t.id)).not.toContain(a.types[0].id);
  await expect(eventTypesView(db, coachA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const { id } = await calendarExecute(db, presidentA, { action: "eventType", name: "Séance vidéo", family: "meeting", color: "meeting", icon: "document", askResponse: false, defaultGroups: ["team"], register: false, archived: false }, clubA);
  await expect(
    calendarExecute(db, presidentA, { action: "eventType", name: "séance vidéo", family: "other", color: "custom", icon: "calendar", askResponse: false, defaultGroups: [], register: false, archived: false }, clubA),
  ).rejects.toMatchObject({ code: "TYPE_EXISTS" });
  // Another club cannot touch it.
  await expect(
    calendarExecute(db, presidentB, { action: "eventType", id, expectedVersion: 1, name: "Piratée", family: "other", color: "custom", icon: "calendar", askResponse: false, defaultGroups: [], register: false, archived: false }, clubB),
  ).rejects.toMatchObject({ code: "STALE_VERSION" });
});

it("invites by group with an answer, parents included, and the parent answers for the child", async () => {
  const training = await typeId(clubA, "Entraînement");
  const { id } = await event(presidentA, clubA, {
    eventTypeId: training,
    invite: { ask: true, deadline: null, groups: [{ kind: "team", ref: lions }, { kind: "guardians", ref: null }] },
  });
  expect((await db.query("SELECT event_type_id,kind FROM calendar_event WHERE id=$1", [id])).rows[0]).toEqual({ event_type_id: training, kind: "training" });
  // Team members invited with an answer; the parent sees the event (participant) without an invitation of their own.
  expect((await invitations(id)).map((i) => i.profile_id).sort()).toEqual([zoe, yanis, coachProfile].sort());
  expect(await participants(id)).toEqual([zoe, yanis, coachProfile, parentProfile].sort());
  const seen = await calendarView(db, parent, { from: day(0), to: day(10), team: "", place: "" } as never);
  expect(seen.events.map((e) => e.id)).toContain(id);
  const zoeInvitation = (await invitations(id)).find((i) => i.profile_id === zoe)!;
  await attendanceExecute(db, parent, { action: "respond", id: zoeInvitation.id, expectedVersion: zoeInvitation.version, response: "present", comment: "" }, clubA);
  // Answered: deleting is refused, cancelling stays.
  const version = (await db.query("SELECT version FROM calendar_event WHERE id=$1", [id])).rows[0].version;
  await expect(calendarExecute(db, presidentA, { action: "delete", id, expectedVersion: version }, clubA)).rejects.toMatchObject({ code: "EVENT_IN_USE" });
  // The view says how to edit the choice again.
  const mine = (await calendarView(db, presidentA, { from: day(0), to: day(10), team: "", place: "" } as never)).events.find((e) => e.id === id)!;
  expect(mine.inviteGroups).toEqual(expect.arrayContaining([{ kind: "team", ref: lions }, { kind: "guardians", ref: null }]));
  expect(mine.type_name).toBe("Entraînement");
});

it("invites a Communication group and people one by one; a coach stays within the team", async () => {
  const preview = (await calendarExecute(db, presidentA, { action: "previewInvite", teamId: lions, invite: { ask: false, deadline: null, groups: [{ kind: "group", ref: groupId }, { kind: "person", ref: coachProfile }] } }, clubA)) as unknown as {
    count: number;
  };
  expect(preview.count).toBe(2);
  const { id } = await event(presidentA, clubA, { invite: { ask: false, deadline: null, groups: [{ kind: "group", ref: groupId }] }, visibility: "participants" });
  expect(await participants(id)).toEqual([yanis]);
  expect(await invitations(id)).toEqual([]);
  await expect(event(coachA, clubA, { invite: { ask: true, deadline: null, groups: [{ kind: "players", ref: null }] } })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(event(presidentB, clubB, { teamId: null, visibility: "organization", invite: { ask: false, deadline: null, groups: [{ kind: "group", ref: groupId }] } })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("deletes an event nobody answered, register included", async () => {
  const { id } = await event(presidentA, clubA, { invite: { ask: true, deadline: null, groups: [{ kind: "team", ref: lions }] } });
  expect(await invitations(id)).toHaveLength(3);
  const version = (await db.query("SELECT version FROM calendar_event WHERE id=$1", [id])).rows[0].version;
  await expect(calendarExecute(db, presidentB, { action: "delete", id, expectedVersion: version }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await calendarExecute(db, presidentA, { action: "delete", id, expectedVersion: version }, clubA);
  expect((await db.query("SELECT count(*)::int AS n FROM calendar_event WHERE id=$1", [id])).rows[0].n).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM attendance_register WHERE event_id=$1", [id])).rows[0].n).toBe(0);
});

it("links a trip of the same club only, or creates one from the event", async () => {
  const tripB = (await db.query("INSERT INTO trip(organization_id,title,kind,starts_on,ends_on,created_by) VALUES($1,'Voyage B','away_match',CURRENT_DATE+5,CURRENT_DATE+5,$2) RETURNING id", [clubB, presidentB.userId])).rows[0].id;
  await expect(event(presidentA, clubA, { tripId: tripB })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const tripA = (await db.query("INSERT INTO trip(organization_id,title,kind,starts_on,ends_on,created_by) VALUES($1,'Voyage A','away_match',CURRENT_DATE+5,CURRENT_DATE+5,$2) RETURNING id", [clubA, presidentA.userId])).rows[0].id;
  const { id } = await event(presidentA, clubA, { tripId: tripA, eventTypeId: await typeId(clubA, "Match amical") });
  const view = (await calendarView(db, presidentA, { from: day(0), to: day(10), team: "", place: "" } as never)).events.find((e) => e.id === id)!;
  expect(view.trip).toMatchObject({ id: tripA, title: "Voyage A" });
  const other = await event(presidentA, clubA, { title: "Tournoi de Liège", localStart: `${day(6)}T09:00`, localEnd: `${day(6)}T17:00`, eventTypeId: await typeId(clubA, "Tournoi") });
  const created = await calendarExecute(db, presidentA, { action: "createTrip", eventId: other.id }, clubA);
  expect((await db.query("SELECT title,kind,starts_on::text AS starts_on,calendar_event_id FROM trip WHERE id=$1", [created.id])).rows[0]).toEqual({
    title: "Tournoi de Liège",
    kind: "tournament",
    starts_on: day(6),
    calendar_event_id: other.id,
  });
});

it("cancels with an undo that brings the event back", async () => {
  const { id } = await event(presidentA, clubA, {});
  const version = (await db.query("SELECT version FROM calendar_event WHERE id=$1", [id])).rows[0].version;
  const r = (await calendarExecute(db, presidentA, { action: "cancel", id, expectedVersion: version, scope: "one", reason: "Salle indisponible" }, clubA)) as { undo?: string };
  expect(r.undo).toBeTruthy();
  await expect(undoExecute(db, presidentB, { id: r.undo! }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await undoExecute(db, presidentA, { id: r.undo! }, clubA);
  expect((await db.query("SELECT status FROM calendar_event WHERE id=$1", [id])).rows[0].status).toBe("scheduled");
});
