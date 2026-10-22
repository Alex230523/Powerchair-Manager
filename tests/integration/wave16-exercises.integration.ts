import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { exercisesView, exerciseExecute, exerciseDetail, exerciseDiagram, programPrint } from "../../src/domains/exercises/service";
import { calendarExecute, calendarView } from "../../src/domains/calendar/service";

/** Wave 16 (E2): exercise sheets and training programmes, in two clubs. */
const schema = "w16ex_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, coachA: Principal, coachWriter: Principal, player: Principal, presidentB: Principal, lions: string;

async function actor(org: string, role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Test " + role, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person: person as string };
}
const sheet = (by: Principal, org: string, extra: Record<string, unknown> = {}) =>
  exerciseExecute(
    db,
    by,
    {
      action: "create",
      title: "Slalom fauteuil",
      objective: "driving",
      description: "1. Plots en ligne\n2. Aller-retour",
      safety: "Vitesse réduite",
      durationMinutes: 15,
      playersMin: 2,
      playersMax: 6,
      level: "beginner",
      suited: "both",
      equipment: "8 plots",
      variants: "",
      videoUrl: "",
      tags: ["Conduite"],
      shared: true,
      ...extra,
    } as never,
    org,
  ) as Promise<{ id: string }>;
const day = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date(Date.now() + n * 86400000));
const training = (by: Principal, exercises: { exerciseId: string; minutes: number; notes: string }[]) =>
  calendarExecute(
    db,
    by,
    {
      action: "create",
      title: "Entraînement",
      kind: "training",
      customType: "",
      timezone: "Europe/Brussels",
      localStart: `${day(4)}T18:00`,
      localEnd: `${day(4)}T20:00`,
      fold: "reject",
      teamId: lions,
      placeId: null,
      responsibleId: by.userId,
      visibility: "organization",
      equipment: "",
      instructions: "",
      participants: [],
      documents: [],
      intervalDays: 0,
      occurrences: 1,
      requestId: randomUUID(),
      exercises,
    } as never,
    clubA,
  );

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = (await actor(clubA, "club_president")).p;
  coachA = (await actor(clubA, "coach")).p;
  coachWriter = (await actor(clubA, "coach", ["calendar.manage"])).p;
  const p = await actor(clubA, "player");
  player = p.p;
  presidentB = (await actor(clubB, "club_president")).p;
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  lions = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions') RETURNING id", [clubA, season])).rows[0].id;
  await db.query("WITH c AS (INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Joueur','{player}') RETURNING id) INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) SELECT $1,$3,c.id,'player',CURRENT_DATE-1 FROM c", [clubA, p.person, lions]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

let shared: string, privateSheet: string;
it("lets the president and calendar coaches write, other coaches read, never another club", async () => {
  shared = (await sheet(presidentA, clubA)).id;
  privateSheet = (await sheet(coachWriter, clubA, { title: "Tactique secrète", objective: "tactics", shared: false })).id;
  await expect(sheet(coachA, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(exercisesView(db, player)).rejects.toMatchObject({ code: "FORBIDDEN" });
  // A private sheet is its author's only.
  expect((await exercisesView(db, coachA)).exercises.map((x) => x.id)).toEqual([shared]);
  expect((await exercisesView(db, coachWriter)).exercises.map((x) => x.id).sort()).toEqual([shared, privateSheet].sort());
  await expect(exerciseDetail(db, presidentA, privateSheet)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await exercisesView(db, presidentB)).exercises).toEqual([]);
  await expect(exerciseDetail(db, presidentB, shared)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(exerciseExecute(db, presidentB, { action: "archive", id: shared, archived: true }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("keeps a diagram only when the file is what it says", async () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").toString("base64");
  await expect(exerciseExecute(db, presidentA, { action: "diagram", id: shared, mediaType: "image/png", data: Buffer.from("<svg/>").toString("base64") }, clubA)).rejects.toMatchObject({ code: "INVALID_FILE" });
  await exerciseExecute(db, presidentA, { action: "diagram", id: shared, mediaType: "image/png", data: png }, clubA);
  expect((await exerciseDiagram(db, coachA, shared)).media_type).toBe("image/png");
  await expect(exerciseDiagram(db, presidentB, shared)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // Duplicate: a new sheet by the one who copies it, diagram included.
  const copy = await exerciseExecute(db, coachWriter, { action: "duplicate", id: shared }, clubA);
  expect((await exerciseDetail(db, coachWriter, copy.id)).exercise).toMatchObject({ title: "Slalom fauteuil (2)", has_diagram: true });
});

it("builds the programme of a training; players see titles and minutes, not the notes", async () => {
  const { id } = await training(presidentA, [{ exerciseId: shared, minutes: 20, notes: "Insister sur le regard" }]);
  const staff = (await calendarView(db, presidentA, { from: day(0), to: day(10), team: "", place: "" } as never)).events.find((e) => e.id === id)!;
  expect(staff.program).toEqual([{ id: shared, title: "Slalom fauteuil", minutes: 20, archived: false, notes: "Insister sur le regard" }]);
  const seen = (await calendarView(db, player, { from: day(0), to: day(10), team: "", place: "" } as never)).events.find((e) => e.id === id)!;
  expect(seen.program).toEqual([{ id: shared, title: "Slalom fauteuil", minutes: 20, archived: false }]);
  expect((await programPrint(db, coachA, id)).items.map((x) => [x.title, x.planned_minutes])).toEqual([["Slalom fauteuil", 20]]);
  await expect(programPrint(db, player, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  // Someone else's private sheet cannot be put in a programme.
  await expect(training(presidentA, [{ exerciseId: privateSheet, minutes: 10, notes: "" }])).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await exerciseDetail(db, presidentA, shared)).used.map((u) => u.id)).toEqual([id]);
});

it("keeps an archived sheet in the trainings that used it, not in new ones", async () => {
  await exerciseExecute(db, presidentA, { action: "archive", id: shared, archived: true }, clubA);
  const old = (await db.query("SELECT event_id FROM calendar_event_exercise WHERE exercise_id=$1", [shared])).rows[0].event_id;
  const e = (await calendarView(db, presidentA, { from: day(0), to: day(10), team: "", place: "" } as never)).events.find((x) => x.id === old)!;
  expect(e.program?.[0]).toMatchObject({ title: "Slalom fauteuil", archived: true });
  await expect(training(presidentA, [{ exerciseId: shared, minutes: 10, notes: "" }])).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await exercisesView(db, presidentA)).exercises.find((x) => x.id === shared)?.archived).toBe(true);
});
