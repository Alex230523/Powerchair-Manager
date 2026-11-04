import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { matchExecute } from "../../src/domains/competitions/service";
import { journeyTacticDiagram, journeyView } from "../../src/domains/competitions/journey";
import { exerciseDetail, exerciseExecute, exercisesView, programPrint } from "../../src/domains/exercises/service";
import { libraryExecute, libraryView } from "../../src/domains/exercises/library";
import { calendarExecute } from "../../src/domains/calendar/service";
import type { Drawing } from "../../src/domains/exercises/drawing";

/**
 * 4: exercise and tactic sheets. The free objective kept; a tag created on
 * the fly and reused by another coach; the drawing saved and printed again;
 * a tactic seen by an invited player and refused to one who is not; the
 * counter of trainings and matches; the federal library (proposed, validated,
 * copied independently, refused with a reason); a club of another federation
 * kept out; the former free tags taken over by the migration.
 */
const schema = "ex4_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fed: string, clubA: string, clubB: string, clubC: string, president: Principal, writer: Principal, presidentB: Principal, presidentC: Principal, federation: Principal;
let invited: Principal, notInvited: Principal, team: string, match: string, sheet: string;

async function actor(org: string, role: string, name: string, grants: string[] = [], teamId: string | null = null) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants,team_id) VALUES($1,$2,$3,$4,$5) RETURNING id", [org, userId, role, grants, teamId])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person };
}
async function playerOf(name: string) {
  const a = await actor(clubA, "player", name);
  const id = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,'2010-01-01','{player}') RETURNING id", [clubA, a.person, name])).rows[0].id as string;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubA, team, id]);
  return { p: a.p, profile: id };
}
const fields = (extra: Record<string, unknown> = {}) => ({
  action: "create",
  title: "Sortie de balle",
  genre: "tactic",
  objective: "tactics",
  goal: "Sortir proprement par le côté faible",
  description: "1. Le gardien sert A2\n2. A2 joue en profondeur",
  safety: "",
  durationMinutes: 20,
  playersMin: 4,
  playersMax: 8,
  level: "intermediate",
  suited: "both",
  equipment: "",
  variants: "",
  videoUrl: "",
  tags: ["Relance"],
  shared: true,
  ...extra,
});
const drawing: Drawing = {
  v: 1,
  situations: [
    {
      name: "Sortie côté gauche",
      half: true,
      items: [
        { id: "a", kind: "keeper", team: "A", n: 1, x: 1, y: 7.5 },
        { id: "b", kind: "player", team: "A", n: 2, x: 4, y: 3 },
        { id: "c", kind: "ball", x: 1.5, y: 7.5 },
        { id: "d", kind: "pass", x: 1, y: 7.5, x2: 4, y2: 3 },
      ],
    },
  ],
};
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédé Nord','federation') RETURNING id")).rows[0].id;
  const fed2 = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédé Sud','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [fed])).rows[0].id;
  clubC = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club C','club',$1) RETURNING id", [fed2])).rows[0].id;
  president = (await actor(clubA, "club_president", "Présidente A")).p;
  writer = (await actor(clubA, "coach", "Coach Lina", ["calendar.manage"])).p;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  presidentC = (await actor(clubC, "club_president", "Président C")).p;
  federation = (await actor(fed, "federation_president", "Présidente fédérale")).p;
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  const a = await playerOf("Ana");
  const b = await playerOf("Bilal");
  invited = a.p;
  notInvited = b.p;
  match = (await matchExecute(db, president, { action: "create", teamId: team, opponent: "Lions", home: true, kind: "league", competition: "D1", startsAt: `${day(6)}T14:00`, venue: "", calendarEventId: null, notes: "" } as never, clubA))
    .id as string;
  // Bilal is no longer expected at this match.
  await db.query("UPDATE attendance_invitation i SET withdrawn_at=now() FROM attendance_register r JOIN match m ON m.calendar_event_id=r.event_id WHERE i.register_id=r.id AND m.id=$1 AND i.profile_id=$2", [match, b.profile]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("keeps the free objective next to the type, through an edit and a duplication", async () => {
  sheet = ((await exerciseExecute(db, president, fields() as never, clubA)) as { id: string }).id;
  const d = await exerciseDetail(db, president, sheet);
  expect(d.exercise).toMatchObject({ genre: "tactic", objective: "tactics", goal: "Sortir proprement par le côté faible", creator: "Présidente A", creator_club: "Club A" });
  await exerciseExecute(db, president, { ...fields({ goal: "Sortir par le côté fort" }), action: "update", id: sheet, version: d.exercise.version } as never, clubA);
  expect((await exerciseDetail(db, president, sheet)).exercise.goal).toBe("Sortir par le côté fort");
  // A duplication by another coach keeps the goal and the creator of origin.
  const copy = ((await exerciseExecute(db, writer, { action: "duplicate", id: sheet }, clubA)) as { id: string }).id;
  expect((await exerciseDetail(db, writer, copy)).exercise).toMatchObject({ goal: "Sortir par le côté fort", creator: "Présidente A", creator_club: "Club A", origin_exercise_id: sheet });
  await exerciseExecute(db, writer, { action: "archive", id: copy, archived: true }, clubA);
});

it("creates a tag on the fly, offered then to another coach, and manages it", async () => {
  const v = await exercisesView(db, writer);
  const relance = v.tags.find((g) => g.name === "Relance")!;
  expect(relance).toBeTruthy();
  // The other coach picks it by name: the same tag, no second one.
  const other = ((await exerciseExecute(db, writer, fields({ title: "Relance courte", genre: "exercise", tags: ["relance", "Pressing"] }) as never, clubA)) as { id: string }).id;
  const after = await exercisesView(db, writer);
  expect(after.tags.filter((g) => g.name.toLowerCase() === "relance")).toHaveLength(1);
  expect(after.exercises.find((x) => x.id === other)!.tags.map((g) => g.id)).toContain(relance.id);
  const pressing = after.tags.find((g) => g.name === "Pressing")!;
  await expect(exerciseExecute(db, writer, { action: "tagRename", tagId: pressing.id, name: "RELANCE" }, clubA)).rejects.toMatchObject({ code: "DUPLICATE" });
  await exerciseExecute(db, writer, { action: "tagColor", tagId: pressing.id, color: "c5" }, clubA);
  await exerciseExecute(db, writer, { action: "tagMerge", tagId: pressing.id, into: relance.id }, clubA);
  const merged = await exercisesView(db, writer);
  expect(merged.tags.map((g) => [g.name, g.sheets])).toEqual([["Relance", 3]]);
  // Another club sees none of them and cannot touch them.
  expect((await exercisesView(db, presidentB)).tags).toEqual([]);
  await expect(exerciseExecute(db, presidentB, { action: "tagDelete", tagId: relance.id }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("saves the drawing and prints it again with the programme", async () => {
  await exerciseExecute(db, president, { action: "drawing", id: sheet, drawing }, clubA);
  expect((await exerciseDetail(db, president, sheet)).drawing).toEqual(drawing);
  const ev = (await calendarExecute(
    db,
    president,
    {
      action: "create",
      title: "Entraînement",
      kind: "training",
      customType: "",
      timezone: "Europe/Brussels",
      localStart: `${day(3)}T18:00`,
      localEnd: `${day(3)}T20:00`,
      fold: "reject",
      teamId: team,
      placeId: null,
      responsibleId: president.userId,
      visibility: "organization",
      equipment: "",
      instructions: "",
      participants: [],
      documents: [],
      intervalDays: 0,
      occurrences: 1,
      requestId: randomUUID(),
      exercises: [{ exerciseId: sheet, minutes: 20, notes: "Regard haut" }],
    } as never,
    clubA,
  )) as { id: string };
  const eventId = ev.id;
  const print = await programPrint(db, president, eventId);
  expect(print.drawings[sheet]).toEqual(drawing);
  await expect(exerciseExecute(db, president, { action: "drawing", id: sheet, drawing: { v: 1, situations: [] } as never }, clubA)).rejects.toBeTruthy();
});

it("shows the tactic of a match to the invited player, without the coach's notes, and not to the others", async () => {
  await exerciseExecute(db, president, { action: "tacticAdd", matchId: match, exerciseId: sheet, notes: "Lions pressent haut" }, clubA);
  const staff = await journeyView(db, president, match);
  if (!staff.manage) throw new Error("manage");
  expect(staff.tactics.map((x) => [x.title, x.notes])).toEqual([["Sortie de balle", "Lions pressent haut"]]);
  const seen = await journeyView(db, invited, match);
  if (seen.manage) throw new Error("member");
  expect(seen.tactics).toHaveLength(1);
  expect(seen.tactics[0]).toMatchObject({ title: "Sortie de balle", goal: "Sortir par le côté fort", drawing });
  expect(seen.tactics[0]).not.toHaveProperty("notes");
  const refused = await journeyView(db, notInvited, match);
  if (refused.manage) throw new Error("member");
  expect(refused.tactics).toEqual([]);
  await expect(journeyTacticDiagram(db, notInvited, match, sheet)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // The counter: one training, one match.
  expect((await exerciseDetail(db, president, sheet)).exercise).toMatchObject({ uses: 1, matches: 1 });
  expect((await exerciseDetail(db, president, sheet)).matches.map((m) => m.opponent)).toEqual(["Lions"]);
  // A match of another club cannot receive it.
  await expect(exerciseExecute(db, presidentB, { action: "tacticAdd", matchId: match, exerciseId: sheet, notes: "" }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("proposes a sheet, the federation validates it and another club copies it independently", async () => {
  await exerciseExecute(db, president, { action: "propose", id: sheet }, clubA);
  await expect(exerciseExecute(db, president, { action: "propose", id: sheet }, clubA)).rejects.toMatchObject({ code: "DUPLICATE" });
  expect((await libraryView(db, presidentB)).sheets).toEqual([]);
  const pending = (await libraryView(db, federation)).pending;
  expect(pending.map((x) => [x.title, x.club, x.author])).toEqual([["Sortie de balle", "Club A", "Présidente A"]]);
  // Coach's notes of the match and of the programme never travel.
  expect(JSON.stringify(pending)).not.toContain("Lions pressent haut");
  await libraryExecute(db, federation, { action: "decide", exerciseId: sheet, approve: true, reason: "" }, fed);
  expect((await exerciseDetail(db, president, sheet)).exercise.federal_status).toBe("published");
  const lib = await libraryView(db, presidentB);
  expect(lib.sheets.map((x) => [x.title, x.origin_author, x.origin_club, x.copies])).toEqual([["Sortie de balle", "Présidente A", "Club A", 0]]);
  expect(lib.sheets[0].drawing).toEqual(drawing);
  const copy = ((await libraryExecute(db, presidentB, { action: "copy", id: lib.sheets[0].id }, clubB)) as { id: string }).id;
  const mine = await exerciseDetail(db, presidentB, copy);
  expect(mine.exercise).toMatchObject({ title: "Sortie de balle", creator: "Présidente A", creator_club: "Club A", goal: "Sortir par le côté fort", uses: 0, matches: 0 });
  expect(mine.exercise.tags.map((g) => g.name)).toEqual(["Relance"]);
  expect(mine.drawing).toEqual(drawing);
  // The copy is the club's own: changing it leaves the original as it was.
  await exerciseExecute(db, presidentB, { ...fields({ title: "Sortie de balle B", goal: "Autre objectif" }), action: "update", id: copy, version: mine.exercise.version } as never, clubB);
  expect((await exerciseDetail(db, president, sheet)).exercise).toMatchObject({ title: "Sortie de balle", goal: "Sortir par le côté fort" });
  expect((await libraryView(db, presidentB)).sheets[0]).toMatchObject({ copies: 1, copied: true });
  // A second copy by the same club still counts one club.
  await libraryExecute(db, presidentB, { action: "copy", id: lib.sheets[0].id }, clubB);
  expect((await libraryView(db, presidentB)).sheets[0].copies).toBe(1);
});

it("refuses a proposal with a reason, and keeps a club of another federation out", async () => {
  const other = ((await exerciseExecute(db, president, fields({ title: "Pressing à trois", tags: [] }) as never, clubA)) as { id: string }).id;
  await exerciseExecute(db, president, { action: "propose", id: other }, clubA);
  await expect(libraryExecute(db, federation, { action: "decide", exerciseId: other, approve: false, reason: "" }, fed)).rejects.toMatchObject({ code: "REASON_REQUIRED" });
  await libraryExecute(db, federation, { action: "decide", exerciseId: other, approve: false, reason: "Le 2 contre 1 n'est pas autorisé ainsi" }, fed);
  expect((await exerciseDetail(db, president, other)).exercise).toMatchObject({ federal_status: "refused", federal_reason: "Le 2 contre 1 n'est pas autorisé ainsi" });
  // Club C belongs to another federation: nothing to read, nothing to copy.
  const c = await libraryView(db, presidentC);
  expect(c.sheets).toEqual([]);
  const published = (await libraryView(db, presidentB)).sheets[0].id;
  await expect(libraryExecute(db, presidentC, { action: "copy", id: published }, clubC)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // A club cannot decide; the federation publishes its own sheet.
  await expect(libraryExecute(db, presidentB, { action: "decide", exerciseId: other, approve: true, reason: "" }, clubB)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const { action: _a, shared: _s, ...own } = fields({ title: "Échauffement fédéral", genre: "exercise", objective: "warmup", tags: ["Échauffement"] });
  void _a;
  void _s;
  await libraryExecute(db, federation, { action: "publish", ...own, drawing: null } as never, fed);
  expect((await libraryView(db, presidentB)).sheets.map((x) => [x.title, x.origin_club]).sort()).toEqual([
    ["Sortie de balle", "Club A"],
    ["Échauffement fédéral", "Fédé Nord"],
  ]);
});

it("takes the former free tags over without loss, once", async () => {
  const id = (
    await db.query(
      "INSERT INTO exercise(organization_id,author_id,title,objective,duration_minutes,level,suited,tags) VALUES($1,$2,'Ancienne fiche','driving',10,'beginner','both','{Slalom,relance}') RETURNING id",
      [clubA, president.userId],
    )
  ).rows[0].id;
  const migration = await readFile("db/migrations/0106_exercise_tactics.sql", "utf8");
  await db.query(migration);
  await db.query(migration);
  const tags = (await exerciseDetail(db, president, id)).exercise.tags.map((g) => g.name);
  expect(tags).toEqual(["Relance", "Slalom"]);
  expect((await exercisesView(db, president)).tags.filter((g) => g.name.toLowerCase() === "relance")).toHaveLength(1);
});
