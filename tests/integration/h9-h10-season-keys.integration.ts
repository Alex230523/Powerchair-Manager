import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { scheduleExecute, scheduleView, seasonSlotInviteTick, type Slot } from "../../src/domains/calendar/season-schedule";
import { calendarExecute } from "../../src/domains/calendar/service";
import { commandSchema } from "../../src/domains/calendar/schema";
import { keysExecute, keysView } from "../../src/domains/keys/service";
import { peopleExecute, peopleView } from "../../src/domains/people/service";
import { peopleCommand } from "../../src/domains/people/schema";

/**
 * H9 and H10: the season that skips the holidays of the right community and
 * the public holidays, a date brought back, planning twice without
 * duplicates, a whole series moved with its notices, the invitations two
 * weeks ahead; the keys seen by the president and the coach himself but not
 * another coach, the reminder when he leaves; two clubs.
 */
const schema = "h910_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, presidentB: Principal, coachA: Principal, otherCoach: Principal;
let season: string, team: string, type: string, place: string, coachProfile: string, player: string;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const inDays = (n: number) => iso(new Date(Date.now() + n * 86400000));

async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person };
}
const slot = (extra: Partial<Slot> = {}): Slot => ({
  teamId: team,
  weekday: 3,
  startTime: "18:00",
  endTime: "19:30",
  placeId: place,
  eventTypeId: type,
  responsibleId: presidentA.userId,
  title: "Entraînement du mercredi",
  from: "2026-10-01",
  to: "2026-12-31",
  reactivated: [],
  ...extra,
});
const preview = async (p: Principal, s: Slot) => ((await scheduleExecute(db, p, { action: "preview", seasonId: season, slots: [s] })) as { slots: { dates: { date: string; skip: { kind: string; name?: string; key?: string } | null }[] }[] }).slots[0].dates;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = (await actor(clubA, "club_president", "Présidente A")).p;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  const ca = await actor(clubA, "coach", "Coach Clés");
  coachA = ca.p;
  otherCoach = (await actor(clubA, "coach", "Autre Coach")).p;
  coachProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Coach Clés','{coach}') RETURNING id", [clubA, ca.person])).rows[0].id;
  season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',LEAST('2026-09-01'::date,CURRENT_DATE-1),GREATEST('2027-06-30'::date,CURRENT_DATE+120)) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  const pp = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  player = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Ana Joueuse','2012-01-01','{player}') RETURNING id", [clubA, pp])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubA, team, player]);
  type = (
    await db.query("INSERT INTO event_type(organization_id,name,family,legacy_kind,color,ask_response) VALUES($1,'Entraînement planifié','training','training','training',true) RETURNING id", [clubA])
  ).rows[0].id;
  place = (await db.query("INSERT INTO calendar_place(organization_id,name,address,contact) VALUES($1,'Salle A','Rue 1','') RETURNING id", [clubA])).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("skips the holidays of the club's community and the public holidays", async () => {
  // French-speaking reference by default: the autumn break of 19 October to 1 November 2026.
  const fwb = await preview(presidentA, slot());
  const reason = (list: typeof fwb, d: string) => list.find((x) => x.date === d)?.skip;
  expect(reason(fwb, "2026-10-21")).toMatchObject({ kind: "holiday", name: "Congé d'automne" });
  expect(reason(fwb, "2026-11-04")).toBeNull();
  expect(reason(fwb, "2026-11-11")).toMatchObject({ kind: "public", key: "armistice" });
  expect(reason(fwb, "2026-12-23")).toMatchObject({ kind: "holiday", name: "Vacances d'hiver" });
  // The Flemish reference: autumn break from 2 to 8 November instead.
  await scheduleExecute(db, presidentA, { action: "reference", communities: ["vl"] });
  const vl = await preview(presidentA, slot());
  expect(reason(vl, "2026-10-21")).toBeNull();
  expect(reason(vl, "2026-11-04")).toMatchObject({ kind: "holiday", name: "Herfstvakantie" });
  // A closure of the place and a date brought back.
  await scheduleExecute(db, presidentA, { action: "closure", placeId: place, label: "Travaux", startsOn: "2026-10-05", endsOn: "2026-10-10" });
  const closed = await preview(presidentA, slot({ reactivated: ["2026-11-04"] }));
  expect(reason(closed, "2026-10-07")).toMatchObject({ kind: "closure", name: "Travaux" });
  expect(reason(closed, "2026-11-04")).toBeNull();
  await scheduleExecute(db, presidentA, { action: "reference", communities: ["fwb"] });
  // A club corrects a reference holiday for itself only.
  const autumn = (await scheduleView(db, presidentA)).holidays.find((h) => h.name === "Congé d'automne" && h.school_year === "2026-2027")!;
  await scheduleExecute(db, presidentA, { action: "hideHoliday", id: autumn.id });
  expect(reason(await preview(presidentA, slot()), "2026-10-21")).toBeNull();
  expect((await scheduleView(db, presidentB)).holidays.some((h) => h.id === autumn.id)).toBe(true);
  // Another club cannot preview this season; a coach cannot plan.
  await expect(preview(presidentB, slot())).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(scheduleView(db, coachA)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("creates the series once, even planned twice; the invitations leave two weeks ahead", async () => {
  const near = slot({ from: inDays(1), to: inDays(40), weekday: new Date(Date.now() + 2 * 86400000).getUTCDay() === 0 ? 7 : new Date(Date.now() + 2 * 86400000).getUTCDay(), title: "Séance planifiée" });
  const first = (await scheduleExecute(db, presidentA, { action: "plan", seasonId: season, slots: [near], email: true })) as { results: { created: boolean; sessions: number; error: string | null }[]; recipients: number };
  expect(first.results[0].error).toBeNull();
  expect(first.results[0].created).toBe(true);
  const count = async () => Number((await db.query("SELECT count(*)::int AS n FROM calendar_event WHERE organization_id=$1 AND title='Séance planifiée'", [clubA])).rows[0].n);
  const sessions = await count();
  expect(sessions).toBe(first.results[0].sessions);
  const again = (await scheduleExecute(db, presidentA, { action: "plan", seasonId: season, slots: [near], email: false })) as { results: { created: boolean }[] };
  expect(again.results[0].created).toBe(false);
  expect(await count()).toBe(sessions);
  // The « Calendrier de la saison » email was prepared for the team's families.
  expect((await db.query("SELECT subject FROM newsletter WHERE organization_id=$1", [clubA])).rows.map((r) => r.subject)).toEqual(["Calendrier de la saison"]);
  // The sessions within 14 days get their invitations, once.
  const invited = await seasonSlotInviteTick(db);
  expect(invited).toBeGreaterThanOrEqual(1);
  expect(await seasonSlotInviteTick(db)).toBe(0);
  expect(Number((await db.query("SELECT count(*)::int AS n FROM attendance_invitation WHERE profile_id=$1", [player])).rows[0].n)).toBe(invited);
});

it("moves every future session of the series at once, with notices", async () => {
  const events = (await db.query("SELECT id,version,local_start FROM calendar_event WHERE organization_id=$1 AND title='Séance planifiée' ORDER BY starts_at", [clubA])).rows;
  const second = events[1];
  const before = Number((await db.query("SELECT count(*)::int AS n FROM notification_dispatch WHERE organization_id=$1", [clubA])).rows[0].n);
  await calendarExecute(
    db,
    presidentA,
    commandSchema.parse({
      action: "update",
      id: second.id,
      expectedVersion: second.version,
      scope: "following",
      title: "Séance planifiée",
      kind: "training",
      timezone: "Europe/Brussels",
      localStart: second.local_start.slice(0, 10) + "T19:00",
      localEnd: second.local_start.slice(0, 10) + "T20:30",
      teamId: team,
      placeId: place,
      responsibleId: presidentA.userId,
      visibility: "organization",
      equipment: "",
      instructions: "",
      participants: [],
      documents: [],
      eventTypeId: type,
    }),
    clubA,
  );
  const after = (await db.query("SELECT local_start FROM calendar_event WHERE organization_id=$1 AND title='Séance planifiée' ORDER BY starts_at", [clubA])).rows.map((r) => r.local_start.slice(11));
  expect(after[0]).toBe("18:00");
  expect(after.slice(1).every((x) => x === "19:00")).toBe(true);
  expect(Number((await db.query("SELECT count(*)::int AS n FROM notification_dispatch WHERE organization_id=$1", [clubA])).rows[0].n)).toBeGreaterThan(before);
});

it("keeps the keys in the coach's profile, seen by the president and himself, not another coach", async () => {
  await keysExecute(db, presidentA, { action: "add", profileId: coachProfile, label: "Local du club", handedOn: "2026-09-01", note: "" });
  await keysExecute(db, presidentA, { action: "add", profileId: coachProfile, label: "Cadenas remorque", handedOn: null, note: "double" });
  expect((await keysView(db, coachA, coachProfile)).keys.map((k) => k.label)).toEqual(["Cadenas remorque", "Local du club"]);
  expect((await keysView(db, coachA, coachProfile)).can.edit).toBe(false);
  await expect(keysView(db, otherCoach, coachProfile)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(keysExecute(db, coachA, { action: "add", profileId: coachProfile, label: "Badge", handedOn: null, note: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(keysView(db, presidentB, coachProfile)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(keysExecute(db, presidentB, { action: "add", profileId: coachProfile, label: "Badge", handedOn: null, note: "" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  // The coaches' list counts them, for the president only.
  expect((await peopleView(db, presidentA)).keyCounts).toMatchObject({ [coachProfile]: 2 });
  expect((await peopleView(db, otherCoach)).keyCounts).toBeNull();
});

it("reminds « Récupérer les clés » when the coach leaves", async () => {
  await peopleExecute(db, presidentA, peopleCommand.parse({ action: "directoryArchive", id: coachProfile, role: "coach", archived: true }));
  const task = (await db.query("SELECT title,detail FROM task WHERE organization_id=$1 AND source_kind='keys'", [clubA])).rows;
  expect(task).toEqual([{ title: "Récupérer les clés : Coach Clés", detail: "Cadenas remorque, Local du club" }]);
});
