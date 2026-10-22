import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { clubStatistics } from "../../src/domains/statistics/club";
import { dashboardView } from "../../src/domains/dashboard/service";
import { awardsView, awardExecute, publicHallOfFame, publicAwardPhoto } from "../../src/domains/awards/service";
import { clubExecute } from "../../src/domains/club/service";
import { ensureStorage } from "../../src/domains/storage/service";

/** Wave 16 (S1): the « Club » tab of the statistics, storage, Hall of fame, in two clubs. */
const schema = "w16st_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, presidentB: Principal, coachA: Principal, coachNone: Principal;
let pastA: string, nowA: string, lions: string, eagles: string, ana: string, ben: string, cleo: string, trip: string;
// A one-pixel PNG.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function actor(org: string, role: string, grants: string[] = [], team: string | null = null) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id,locale) VALUES($1,'fr')", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants,team_id) VALUES($1,$2,$3,$4,$5) RETURNING id", [org, userId, role, grants, team])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const person = async (org: string, name: string, birth: string | null) =>
  (
    await db.query(
      "WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,$2,$3::date,'{player}' FROM p RETURNING id",
      [org, name, birth],
    )
  ).rows[0].id as string;
const join = (org: string, team: string, profile: string, role = "player") =>
  db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,$4,CURRENT_DATE-1)", [org, team, profile, role]);
/** A training `days` ago with a register (closed or not) and the given attendance. */
async function training(org: string, team: string | null, days: number, who: [string, string][], closed = true, status = "scheduled") {
  const user = presidentA.userId;
  const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [org, user])).rows[0].id;
  const event = (
    await db.query(
      `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility,status)
       SELECT $1,$2,1,'Entraînement','training','Europe/Brussels',x.s,x.s+interval '2 hours',
              to_char(x.s AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),to_char((x.s+interval '2 hours') AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),$3,$5,'team',$6
         FROM (SELECT ((CURRENT_DATE-$4::int)+time '10:00') AT TIME ZONE 'Europe/Brussels' AS s) x RETURNING id`,
      [org, series, team, days, user, status],
    )
  ).rows[0].id;
  const reg = (
    await db.query("INSERT INTO attendance_register(organization_id,event_id,deadline,closed_at,closed_by) VALUES($1,$2,now(),$3,$4) RETURNING id", [org, event, closed ? new Date() : null, closed ? user : null])
  ).rows[0].id;
  for (const [profile, actual] of who)
    await db.query("INSERT INTO attendance_invitation(organization_id,register_id,profile_id,response,actual) VALUES($1,$2,$3,'present',$4)", [org, reg, profile, actual]);
}
const match = (org: string, team: string, days: number, our: number | null, their: number | null, status = "played") =>
  db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,status,our_score,their_score,created_by) VALUES($1,$2,'Adversaire','league',now()-($3::int||' days')::interval,$4,$5,$6,$7)", [
    org,
    team,
    days,
    status,
    our,
    their,
    presidentA.userId,
  ]);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president");
  presidentB = await actor(clubB, "club_president");
  pastA = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2025-26',CURRENT_DATE-430,CURRENT_DATE-101) RETURNING id", [clubA])).rows[0].id;
  nowA = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-100,CURRENT_DATE+230) RETURNING id", [clubA])).rows[0].id;
  const oldLions = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Lions','blue') RETURNING id", [clubA, pastA])).rows[0].id;
  lions = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Lions','blue') RETURNING id", [clubA, nowA])).rows[0].id;
  eagles = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Aigles','amber') RETURNING id", [clubA, nowA])).rows[0].id;
  ana = await person(clubA, "Ana", "2016-03-01");
  ben = await person(clubA, "Ben", "2000-01-01");
  cleo = await person(clubA, "Cléo", null);
  const coachProfile = await person(clubA, "Coach Lions", "1980-01-01");
  await join(clubA, oldLions, ana);
  await join(clubA, oldLions, ben);
  await join(clubA, lions, ana);
  await join(clubA, lions, cleo);
  await join(clubA, eagles, cleo);
  await join(clubA, lions, coachProfile, "coach");
  coachA = await actor(clubA, "coach", ["attendance.manage"], lions);
  coachNone = await actor(clubA, "coach");
  // Club B: one team, one player, never seen by club A.
  const nowB = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-100,CURRENT_DATE+230) RETURNING id", [clubB])).rows[0].id;
  const others = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Autres') RETURNING id", [clubB, nowB])).rows[0].id;
  await join(clubB, others, await person(clubB, "Zed", "2001-01-01"));
  // Trainings this season: Lions 2 of 2 then 1 of 2, Aigles 0 of 1; an open register and a cancelled session do not count.
  await training(clubA, lions, 20, [
    [ana, "present"],
    [cleo, "late"],
  ]);
  await training(clubA, lions, 6, [
    [ana, "present"],
    [cleo, "absent"],
  ]);
  await training(clubA, eagles, 6, [[cleo, "absent"]]);
  await training(clubA, lions, 3, [[ana, "absent"]], false);
  await training(clubA, lions, 4, [[ana, "absent"]], true, "cancelled");
  // Matches: Lions won and drew, a cancelled and a scheduled one never count.
  await match(clubA, lions, 10, 3, 1);
  await match(clubA, lions, 5, 2, 2);
  await match(clubA, lions, 4, null, null, "cancelled");
  await match(clubA, eagles, -3, null, null, "scheduled");
  trip = (
    await db.query(
      "INSERT INTO trip(organization_id,title,kind,starts_on,ends_on,team_id,final_rank,teams_count,created_by) VALUES($1,'Tournoi de Gand','tournament',CURRENT_DATE-30,CURRENT_DATE-29,$2,2,8,$3) RETURNING id",
      [clubA, lions, presidentA.userId],
    )
  ).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("shows the same key figures as the home, the treasury for the money, the attendance rate otherwise", async () => {
  const s = (await clubStatistics(db, presidentA, "summary", {})) as { tiles: Record<string, number | null>; season: { name: string }; can: Record<string, boolean> };
  expect(s.season.name).toBe("2026-27");
  // Trainings held and not cancelled, register closed or not.
  expect(s.tiles).toMatchObject({ players: 2, coaches: 1, trainings: 4, matches: 2, treasury: 0, attendance: null });
  const home = (await dashboardView(db, presidentA)).metrics;
  for (const [key, tile] of [
    ["seasonPlayers", "players"],
    ["seasonCoaches", "coaches"],
    ["trainingsDone", "trainings"],
    ["matchesPlayed", "matches"],
  ])
    expect(home.find((m) => m.key === key)?.value).toBe(s.tiles[tile]);
  expect(s.can).toEqual({ money: true, storage: true, manageAwards: true });
  // The coach of the Lions: his team only, no money; 3 present out of 4 on the closed registers.
  const c = (await clubStatistics(db, coachA, "summary", {})) as { tiles: Record<string, number | null>; restricted: boolean };
  expect(c.restricted).toBe(true);
  expect(c.tiles).toMatchObject({ players: 2, trainings: 3, matches: 2, treasury: null, attendance: 75 });
  await expect(clubStatistics(db, coachNone, "summary", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(clubStatistics(db, coachA, "storage", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("draws the attendance by month and by ISO week, closed registers only, an empty week left empty", async () => {
  const m = (await clubStatistics(db, presidentA, "attendance", {})) as { buckets: string[]; teams: { name: string; values: (number | null)[] }[]; club: (number | null)[]; scoped: unknown };
  expect(m.buckets.every((b) => /^\d{4}-\d{2}$/.test(b))).toBe(true);
  expect(m.teams.map((x) => x.name)).toEqual(["Aigles", "Lions"]);
  expect(m.scoped).toBeNull();
  // 3 present (late counts) out of 5 in all.
  const total = m.club.filter((v) => v !== null);
  expect(total.length).toBeGreaterThan(0);
  const w = (await clubStatistics(db, presidentA, "attendance", { grain: "week" })) as { buckets: string[]; club: (number | null)[] };
  expect(w.buckets.every((b) => new Date(b + "T12:00:00Z").getUTCDay() === 1)).toBe(true);
  expect(w.club.filter((v) => v !== null)).toHaveLength(2);
  expect(w.club.filter((v) => v === null).length).toBeGreaterThan(5);
  expect(w.club.filter((v) => v !== null).sort((a, b) => a! - b!)).toEqual([33, 100]);
  // The coach: his team's line and the club's average.
  const c = (await clubStatistics(db, coachA, "attendance", { grain: "week" })) as { teams: { name: string }[]; scoped: (number | null)[] | null };
  expect(c.teams.map((x) => x.name)).toEqual(["Lions"]);
  expect(c.scoped!.filter((v) => v !== null).sort((a, b) => a! - b!)).toEqual([50, 100]);
});

it("counts the headcount by team, age and coaches over the last five seasons", async () => {
  type H = { seasons: { name: string; total: number; shared: number; teams: { name: string; count: number }[]; ages: { key: string; count: number }[] | null }[] };
  const teams = (await clubStatistics(db, presidentA, "headcount", {})) as H;
  expect(teams.seasons.map((s) => [s.name, s.total, s.shared])).toEqual([
    ["2025-26", 2, 0],
    ["2026-27", 2, 1],
  ]);
  expect(teams.seasons[1].teams).toEqual([
    { name: "Aigles", color: "amber", count: 1 },
    { name: "Lions", color: "blue", count: 2 },
  ]);
  const ages = (await clubStatistics(db, presidentA, "headcount", { view: "age" })) as H;
  const now = ages.seasons[1].ages!;
  expect(now.find((x) => x.key === "unknown")?.count).toBe(1);
  expect(now.reduce((n, x) => n + x.count, 0)).toBe(2);
  const coaches = (await clubStatistics(db, presidentA, "headcount", { view: "coaches" })) as H;
  expect(coaches.seasons[1].teams).toEqual([{ name: "Lions", color: "blue", count: 1 }]);
  // Only the current season.
  const one = (await clubStatistics(db, presidentA, "headcount", { period: "season" })) as H & { names: string[] };
  expect(one.names).toEqual(["2026-27"]);
  expect(JSON.stringify(teams)).not.toContain("Autres");
});

it("uses the classification history when it exists, today's classification before it", async () => {
  type H = { historyStart: string | null; seasons: { name: string; classes: { key: string; count: number }[]; currentClassification: boolean }[] };
  // No history before today: the past season shows today's classification, with the note.
  await db.query("INSERT INTO player_sport_profile(profile_id,organization_id,classification) VALUES($1,$2,'PF1'),($3,$2,'PF2')", [ana, clubA, ben]);
  let v = (await clubStatistics(db, presidentA, "headcount", { view: "classification" })) as H;
  expect(v.seasons[0]).toMatchObject({ name: "2025-26", currentClassification: true });
  expect(v.seasons[0].classes.filter((x) => x.count)).toEqual([
    { key: "PF1", count: 1 },
    { key: "PF2", count: 1 },
  ]);
  // The trigger writes each change.
  await db.query("UPDATE player_sport_profile SET classification='PF2' WHERE profile_id=$1", [ana]);
  expect((await db.query("SELECT classification,valid_to FROM classification_history WHERE profile_id=$1 ORDER BY id", [ana])).rows.length).toBe(2);
  // A history going back before the past season: Ana was PF1 then, PF2 now.
  await db.query("DELETE FROM classification_history WHERE profile_id=$1", [ana]);
  await db.query(
    "INSERT INTO classification_history(organization_id,profile_id,classification,status,valid_from,valid_to) VALUES($1,$2,'PF1','validated',CURRENT_DATE-500,CURRENT_DATE-50),($1,$2,'PF2','validated',CURRENT_DATE-50,NULL)",
    [clubA, ana],
  );
  v = (await clubStatistics(db, presidentA, "headcount", { view: "classification" })) as H;
  expect(v.historyStart).not.toBeNull();
  expect(v.seasons[0].currentClassification).toBe(false);
  expect(v.seasons[0].classes.find((x) => x.key === "PF1")?.count).toBe(1);
  expect(v.seasons[1].classes.find((x) => x.key === "PF2")?.count).toBe(1);
  expect(v.seasons[1].classes.find((x) => x.key === "not_classified")?.count).toBe(1);
});

it("rings the results of the played matches per team, a grey ring for a team without one", async () => {
  const r = (await clubStatistics(db, presidentA, "results", {})) as { teams: { name: string; won: number; drawn: number; lost: number; team_id: string; season_id: string }[] };
  expect(r.teams.map((x) => [x.name, x.won, x.drawn, x.lost])).toEqual([
    ["Aigles", 0, 0, 0],
    ["Lions", 1, 1, 0],
  ]);
  expect(r.teams[1]).toMatchObject({ team_id: lions, season_id: nowA });
  expect((await clubStatistics(db, presidentB, "results", {})) as { teams: unknown[] }).toMatchObject({ teams: [{ name: "Autres", won: 0 }] });
});

it("adds up the storage by category and refuses an upload over the quota", async () => {
  await clubExecute(db, presidentA, { action: "logo", mediaType: "image/png", data: png.toString("base64") }, clubA);
  const s = (await clubStatistics(db, presidentA, "storage", {})) as { used: number; quota: number; level: string; categories: { key: string; bytes: number; files: number }[] };
  expect(s.quota).toBe(1073741824);
  expect(s.categories.find((c) => c.key === "photos")).toEqual({ key: "photos", bytes: png.length, files: 1 });
  expect(s.used).toBe(png.length);
  expect(s.level).toBe("ok");
  const l = (await clubStatistics(db, presidentA, "largest", {})) as { files: { href: string; bytes: number }[] };
  expect(l.files).toEqual([expect.objectContaining({ href: "/settings/club", bytes: png.length })]);
  expect(((await clubStatistics(db, presidentB, "storage", {})) as { used: number }).used).toBe(0);
  // Over the quota: refused, nothing written; replacing a file by a smaller one still fits.
  await db.query("UPDATE organization SET storage_quota_bytes=$2 WHERE id=$1", [clubA, png.length + 10]);
  await expect(ensureStorage(db, clubA, 11)).rejects.toMatchObject({ code: "STORAGE_FULL" });
  await expect(ensureStorage(db, clubA, png.length, png.length)).resolves.toBeUndefined();
  const { id } = await awardExecute(
    db,
    presidentA,
    { action: "create", title: "Fair-play", competition: "", kind: "club", place: null, awardedOn: "2026-06-01", seasonId: null, teamId: null, profileId: null, note: "", publishable: true, tripId: null },
    clubA,
  );
  await expect(awardExecute(db, presidentA, { action: "photo", id, mediaType: "image/png", data: png.toString("base64") }, clubA)).rejects.toMatchObject({ code: "STORAGE_FULL" });
  expect((await db.query("SELECT photo FROM award WHERE id=$1", [id])).rows[0].photo).toBeNull();
  const full = (await clubStatistics(db, presidentA, "storage", {})) as { level: string; percent: number };
  expect(full.level).toBe("warning");
  await db.query("UPDATE organization SET storage_quota_bytes=1073741824 WHERE id=$1", [clubA]);
  await awardExecute(db, presidentA, { action: "delete", id }, clubA);
});

it("suggests a podium tournament once, adds it only when confirmed", async () => {
  const before = await awardsView(db, presidentA);
  expect(before.awards).toEqual([]);
  expect(before.suggestions).toEqual([expect.objectContaining({ trip_id: trip, place: 2, team_id: lions, season_id: nowA })]);
  expect((await awardsView(db, presidentB)).suggestions).toEqual([]);
  // The coach without the teams right reads, never writes.
  expect((await awardsView(db, coachA)).can).toEqual({ manage: false, widget: false });
  const create = {
    action: "create" as const,
    title: "Tournoi de Gand",
    competition: "Coupe des Flandres",
    kind: "team" as const,
    place: 2,
    awardedOn: before.suggestions[0].awarded_on,
    seasonId: nowA,
    teamId: lions,
    profileId: null,
    note: "",
    publishable: false,
    tripId: trip,
  };
  await expect(awardExecute(db, coachA, create, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(awardExecute(db, presidentB, { ...create, seasonId: null, teamId: null }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await awardExecute(db, presidentA, create, clubA);
  const after = await awardsView(db, presidentA);
  expect(after.suggestions).toEqual([]);
  expect(after.awards).toEqual([expect.objectContaining({ title: "Tournoi de Gand", source: "tournament", place: 2, team: "Lions", season: "2026-27" })]);
  await expect(awardExecute(db, presidentA, create, clubA)).rejects.toMatchObject({ code: "AWARD_EXISTS" });
  // Read by every member; nothing of club A in club B.
  expect((await awardsView(db, coachNone)).awards).toHaveLength(1);
  expect((await awardsView(db, presidentB)).awards).toEqual([]);
});

it("shows on the public page no person's prize and no photo without « Peut être publié »", async () => {
  const add = (title: string, kind: "team" | "individual", publishable: boolean, profileId: string | null) =>
    awardExecute(
      db,
      presidentA,
      { action: "create", title, competition: "", kind, place: 1, awardedOn: "2026-05-01", seasonId: pastA, teamId: null, profileId, note: "Note interne", publishable, tripId: null },
      clubA,
    );
  const hidden = await add("Meilleure joueuse", "individual", false, ana);
  const shown = await add("Meilleur buteur", "individual", true, ben);
  const team = await add("Champion D2", "team", false, null);
  for (const x of [hidden, shown, team]) await awardExecute(db, presidentA, { action: "photo", id: x.id, mediaType: "image/png", data: png.toString("base64") }, clubA);
  // Off by default; switched on by the president only.
  expect((await awardsView(db, presidentA)).widget).toBeNull();
  await expect(awardExecute(db, coachA, { action: "widget", enabled: true }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await awardExecute(db, presidentA, { action: "widget", enabled: true }, clubA);
  const widget = (await awardsView(db, presidentA)).widget!;
  const hall = (await publicHallOfFame(db, widget, "Hors saison"))!;
  const titles = hall.seasons.flatMap((g) => g.items.map((a) => a.title));
  expect(titles).not.toContain("Meilleure joueuse");
  expect(titles).toEqual(expect.arrayContaining(["Meilleur buteur", "Champion D2", "Tournoi de Gand"]));
  const json = JSON.stringify(hall);
  expect(json).not.toContain("Ana");
  expect(json).not.toContain("Note interne");
  const item = (t: string) => hall.seasons.flatMap((g) => g.items).find((a) => a.title === t)!;
  expect(item("Meilleur buteur")).toMatchObject({ person: "Ben", has_photo: true });
  expect(item("Champion D2").has_photo).toBe(false);
  expect(await publicAwardPhoto(db, widget, team.id)).toBeNull();
  expect(await publicAwardPhoto(db, widget, hidden.id)).toBeNull();
  expect((await publicAwardPhoto(db, widget, shown.id))?.photo_type).toBe("image/png");
  // Seasons newest first.
  expect(hall.seasons.map((g) => g.season)).toEqual(["2026-27", "2025-26"]);
  // Switched off: the old address shows nothing; the Statistics module off likewise.
  await awardExecute(db, presidentA, { action: "widget", enabled: false }, clubA);
  expect(await publicHallOfFame(db, widget, "")).toBeNull();
  await awardExecute(db, presidentA, { action: "widget", enabled: true }, clubA);
  const again = (await awardsView(db, presidentA)).widget!;
  expect(again).not.toBe(widget);
  await db.query("UPDATE organization SET disabled_modules='{statistics}' WHERE id=$1", [clubA]);
  expect(await publicHallOfFame(db, again, "")).toBeNull();
  await expect(awardsView(db, presidentA)).rejects.toMatchObject({ code: "MODULE_OFF" });
  await db.query("UPDATE organization SET disabled_modules='{}' WHERE id=$1", [clubA]);
});
