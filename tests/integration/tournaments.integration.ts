import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { defaultRules, tournamentCommand } from "../../src/domains/tournaments/schema";
import { tournamentDaysIn, tournamentExecute, tournamentsView, tournamentView, trophiesView, trophyPhoto, trophyPhotoSave } from "../../src/domains/tournaments/service";

/** Tournaments (21/10/2026): a federation, two invited clubs, a club left out, results reported then validated. */
const schema = "tour_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fed: string, clubA: string, clubB: string, clubC: string;
let fedPresident: Principal, referee: Principal, presidentA: Principal, playerA: Principal, coachB: Principal, presidentB: Principal, presidentC: Principal;
let tournamentId: string, dayId: string, matchId: string, zoe: string, yanis: string, other: string;
const year = 2026;

async function actor(org: string, role: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Test " + role + " " + userId.slice(0, 4), userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const player = async (org: string, name: string) =>
  (
    await db.query(
      "WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,$2,'2008-01-01','{player}' FROM p RETURNING id",
      [org, name],
    )
  ).rows[0].id as string;
const run = (p: Principal, org: string, input: Record<string, unknown>) => tournamentExecute(db, p, tournamentCommand.parse(input), org);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération test','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [fed])).rows[0].id;
  clubC = (await db.query("INSERT INTO organization(name,kind) VALUES('Club C','club') RETURNING id")).rows[0].id;
  fedPresident = await actor(fed, "federation_president");
  referee = await actor(fed, "referee");
  presidentA = await actor(clubA, "club_president");
  playerA = await actor(clubA, "player");
  coachB = await actor(clubB, "coach");
  presidentB = await actor(clubB, "club_president");
  presidentC = await actor(clubC, "club_president");
  zoe = await player(clubA, "Zoé Martin");
  yanis = await player(clubB, "Yanis Peeters");
  other = await player(clubC, "Hors tournoi");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("lets a federation president create a tournament and invite two clubs; others do not see it", async () => {
  tournamentId = (await run(fedPresident, fed, { action: "create", name: "Championnat test", year, format: "league", rules: defaultRules, description: "", clubs: [clubA, clubB] })).id;
  await expect(run(playerA, clubA, { action: "create", name: "Pas permis", year, format: "league", rules: defaultRules, description: "", clubs: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  const a = await tournamentsView(db, presidentA, year);
  expect(a.invitations.map((i) => i.id)).toEqual([tournamentId]);
  expect(a.tournaments[0]).toMatchObject({ id: tournamentId, myStatus: "invited", ownerKind: "federation" });
  expect((await tournamentsView(db, presidentC, year)).tournaments).toEqual([]);
  await expect(tournamentView(db, presidentC, tournamentId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await run(presidentA, clubA, { action: "respond", id: tournamentId, accept: true, teamName: "" });
  await expect(run(coachB, clubB, { action: "respond", id: tournamentId, accept: true, teamName: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(presidentB, clubB, { action: "respond", id: tournamentId, accept: true, teamName: "Les Béliers" });
  expect((await tournamentView(db, presidentB, tournamentId)).clubs.map((c) => [c.name, c.status])).toEqual([
    ["Club A", "accepted"],
    ["Les Béliers", "accepted"],
  ]);
});

it("plans a day hosted by a club and a match with a federation referee; only the organiser plans", async () => {
  dayId = (await run(fedPresident, fed, { action: "day", id: tournamentId, dayId: null, label: "Journée 1", day: `${year}-11-14`, venue: "Hall A", hostId: clubA, notes: "Accueil 9 h" })).id;
  await expect(run(presidentA, clubA, { action: "day", id: tournamentId, dayId: null, label: "", day: `${year}-11-15`, venue: "", hostId: null, notes: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  matchId = (
    await run(fedPresident, fed, { action: "match", id: tournamentId, matchId: null, dayId, kickoff: "10:30", stage: "league", group: "", home: clubA, away: clubB, refereeId: referee.userId })
  ).id;
  await expect(
    run(fedPresident, fed, { action: "match", id: tournamentId, matchId: null, dayId, kickoff: "11:30", stage: "league", group: "", home: clubA, away: clubC, refereeId: null }),
  ).rejects.toMatchObject({ code: "CLUB_NOT_ACCEPTED" });
  // The day appears in the calendar of the clubs that play and of the referee, not elsewhere.
  expect((await tournamentDaysIn(db, presidentA, `${year}-11-01`, `${year}-11-30`)).map((d) => d.date)).toEqual([`${year}-11-14`]);
  expect(await tournamentDaysIn(db, referee, `${year}-11-01`, `${year}-11-30`)).toHaveLength(1);
  expect(await tournamentDaysIn(db, presidentC, `${year}-11-01`, `${year}-11-30`)).toEqual([]);
});

it("takes the first result from a club, then lets only the organiser or the referee correct and validate it", async () => {
  const view = await tournamentView(db, coachB, tournamentId);
  const m = view.days[0].matches[0];
  expect(m).toMatchObject({ canReport: true, canValidate: false, statClubs: [clubB] });
  expect(view.rosters.map((r) => r.name)).toEqual(["Yanis Peeters"]);
  const line = (profileId: string, goals: number) => ({ profileId, goals, assists: 0, yellowCards: 0, redCard: false });
  // A coach enters only his own club's players, never validates.
  await expect(run(coachB, clubB, { action: "result", id: tournamentId, matchId, version: m.version, homeScore: 1, awayScore: 2, homeShootout: null, awayShootout: null, stats: [line(zoe, 1)], validate: false })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(run(coachB, clubB, { action: "result", id: tournamentId, matchId, version: m.version, homeScore: 1, awayScore: 2, homeShootout: null, awayShootout: null, stats: [], validate: true })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await run(coachB, clubB, { action: "result", id: tournamentId, matchId, version: m.version, homeScore: 1, awayScore: 2, homeShootout: null, awayShootout: null, stats: [line(yanis, 2)], validate: false });
  // Already entered: a club that is not hosting the day, and a player, cannot overwrite it (Club A hosts: it organises the day).
  expect((await tournamentView(db, presidentA, tournamentId)).days[0].matches[0]).toMatchObject({ canReport: true, canValidate: true });
  await expect(run(presidentB, clubB, { action: "result", id: tournamentId, matchId, version: m.version + 1, homeScore: 5, awayScore: 0, homeShootout: null, awayShootout: null, stats: [], validate: false })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(run(playerA, clubA, { action: "validate", id: tournamentId, matchId, version: m.version + 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  // Not validated yet: nothing counts.
  let detail = await tournamentView(db, playerA, tournamentId);
  expect(detail.pending).toBe(1);
  expect(detail.tables[0].rows.every((r) => r.played === 0)).toBe(true);
  // The referee adds the home scorer, keeps the visitors' line, and validates.
  await run(referee, fed, { action: "result", id: tournamentId, matchId, version: m.version + 1, homeScore: 1, awayScore: 2, homeShootout: null, awayShootout: null, stats: [line(zoe, 1), line(yanis, 2)], validate: true });
  await expect(run(referee, fed, { action: "result", id: tournamentId, matchId, version: m.version + 1, homeScore: 0, awayScore: 0, homeShootout: null, awayShootout: null, stats: [], validate: true })).rejects.toMatchObject({
    code: "STALE_VERSION",
  });
  detail = await tournamentView(db, playerA, tournamentId);
  expect(detail.tables[0].rows.map((r) => [r.name, r.points])).toEqual([
    ["Les Béliers", 3],
    ["Club A", 0],
  ]);
  expect(detail.scorers.map((s) => [s.name, s.goals])).toEqual([
    ["Yanis Peeters", 2],
    ["Zoé Martin", 1],
  ]);
  expect(detail.days[0].matches[0].status).toBe("validated");
  expect(detail.days[0].matches[0].referee).toContain("referee");
  expect(detail.podium.map((p) => p.name)).toEqual(["Les Béliers", "Club A"]);
});

it("closes the tournament: the podium becomes trophies, each club adds its own photo", async () => {
  await expect(run(presidentA, clubA, { action: "finish", id: tournamentId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(fedPresident, fed, { action: "finish", id: tournamentId });
  await expect(run(referee, fed, { action: "validate", id: tournamentId, matchId, version: 99 })).rejects.toMatchObject({ code: "TOURNAMENT_FINISHED" });
  const gallery = await trophiesView(db, presidentA);
  expect(gallery.trophies.map((x) => [x.rank, x.club, x.mine])).toEqual([
    [1, "Les Béliers", false],
    [2, "Club A", true],
  ]);
  expect((await trophiesView(db, presidentC)).trophies).toEqual([]);
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").toString("base64");
  const mine = gallery.trophies.find((x) => x.mine)!,
    theirs = gallery.trophies.find((x) => !x.mine)!;
  await trophyPhotoSave(db, presidentA, mine.id, "image/png", png, clubA);
  await expect(trophyPhotoSave(db, presidentA, theirs.id, "image/png", png, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(trophyPhotoSave(db, presidentA, mine.id, "image/png", Buffer.from("not an image").toString("base64"), clubA)).rejects.toMatchObject({ code: "INVALID_FILE" });
  expect((await trophyPhoto(db, presidentB, mine.id)).photo_type).toBe("image/png");
  await expect(trophyPhoto(db, presidentC, mine.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action LIKE 'tournament.%'")).rows[0].n).toBeGreaterThan(5);
});

it("lets a club president run a tournament of his own, his club taking part from the start", async () => {
  const id = (await run(presidentC, clubC, { action: "create", name: "Tournoi du club C", year, format: "knockout", rules: defaultRules, description: "", clubs: [clubA] })).id;
  const v = await tournamentView(db, presidentC, id);
  expect(v.manage).toBe(true);
  expect(v.clubs.map((c) => [c.name, c.status])).toEqual([
    ["Club A", "invited"],
    ["Club C", "accepted"],
  ]);
  // Club A sees it (invited); Club B, not invited and not in a common federation tournament, does not.
  expect((await tournamentsView(db, presidentA, year)).tournaments.map((t) => t.name)).toContain("Tournoi du club C");
  await expect(tournamentView(db, presidentB, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  void other;
});
