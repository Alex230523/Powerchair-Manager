import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { tournamentCommand, defaultRules } from "../../src/domains/tournaments/schema";
import { tournamentExecute, tournamentView, tournamentsView } from "../../src/domains/tournaments/service";

/**
 * International, step 4 (06/11/2026): the competition as the organiser's
 * object, seen by both clubs. A tournament carries its tier and tells
 * whether it is international; a club names its team, and every match of
 * the tournament is mirrored in that team's calendar (opponent, home or
 * away, time, venue), with the result once validated; a match removed is
 * cancelled in the clubs' calendars, never deleted.
 */
const schema = "mirror_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
const year = 2026;
let fed: string, clubA: string, clubN: string, teamA: string, teamN: string, fedPresident: Principal, presidentA: Principal, presidentN: Principal, tournamentId: string, dayId: string, matchId: string;

async function actor(org: string, role: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, role + " " + userId.slice(0, 4), `${userId}@example.test`]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const run = (p: Principal, org: string, input: Record<string, unknown>) => tournamentExecute(db, p, tournamentCommand.parse(input), org);
const mirrors = async (org: string) => (await db.query("SELECT team_id,opponent,home,kind,competition,to_char(starts_at AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD HH24:MI') AS at,venue,status,our_score,their_score,tournament_match_id FROM match WHERE organization_id=$1 ORDER BY starts_at", [org])).rows;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('BPCF','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  clubN = (await db.query("INSERT INTO organization(name,kind,country_code) VALUES('Rotterdam PC','club','NL') RETURNING id")).rows[0].id;
  const seasonA = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-2027','2026-09-01','2027-06-30') RETURNING id", [clubA])).rows[0].id;
  const seasonN = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-2027','2026-09-01','2027-06-30') RETURNING id", [clubN])).rows[0].id;
  teamA = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'A1') RETURNING id", [clubA, seasonA])).rows[0].id;
  teamN = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Rotterdam 1') RETURNING id", [clubN, seasonN])).rows[0].id;
  fedPresident = await actor(fed, "federation_president");
  presidentA = await actor(clubA, "club_president");
  presidentN = await actor(clubN, "club_president");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("carries the tier, tells an international competition, and mirrors the matches into the clubs' calendars", async () => {
  tournamentId = (await run(fedPresident, fed, { action: "create", name: "Coupe Benelux", year, format: "knockout", rules: defaultRules, description: "", clubs: [clubA, clubN], tier: 1 })).id;
  expect((await tournamentsView(db, fedPresident, year)).tournaments[0]).toMatchObject({ tier: 1 });
  // A wrong team is refused; each club names its team when accepting (Rotterdam later).
  await expect(run(presidentA, clubA, { action: "respond", id: tournamentId, accept: true, teamName: "", teamId: teamN })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await run(presidentA, clubA, { action: "respond", id: tournamentId, accept: true, teamName: "", teamId: teamA });
  await run(presidentN, clubN, { action: "respond", id: tournamentId, accept: true, teamName: "Rotterdam Powerchair", teamId: null });
  const view = await tournamentView(db, presidentA, tournamentId);
  expect(view.tournament).toMatchObject({ tier: 1, international: true, countries: ["BE", "NL"] });
  expect(view.myTeam).toBe(teamA);
  expect(view.myTeams.map((x) => x.name)).toEqual(["A1"]);
  expect(view.clubs.map((c) => [c.clubName, c.country, c.hasTeam])).toEqual([
    ["Club A", "BE", true],
    ["Rotterdam PC", "NL", false],
  ]);
  // A day and a match: Club A's team gets the match in its calendar at once; Rotterdam has no team yet.
  dayId = (await run(fedPresident, fed, { action: "day", id: tournamentId, dayId: null, label: "Finale", day: `${year}-12-05`, venue: "Hall Benelux", hostId: null, notes: "" })).id;
  matchId = (await run(fedPresident, fed, { action: "match", id: tournamentId, matchId: null, dayId, kickoff: "14:00", stage: "final", group: "", home: clubN, away: clubA, refereeId: null })).id;
  expect(await mirrors(clubA)).toEqual([{ team_id: teamA, opponent: "Rotterdam Powerchair", home: false, kind: "tournament", competition: "Coupe Benelux", at: `${year}-12-05 14:00`, venue: "Hall Benelux", status: "scheduled", our_score: null, their_score: null, tournament_match_id: matchId }]);
  expect(await mirrors(clubN)).toEqual([]);
  // Rotterdam names its team: its calendar fills; the fixture moves and both follow.
  await run(presidentN, clubN, { action: "team", id: tournamentId, teamId: teamN });
  expect(await mirrors(clubN)).toMatchObject([{ team_id: teamN, opponent: "Club A", home: true, at: `${year}-12-05 14:00` }]);
  await run(fedPresident, fed, { action: "match", id: tournamentId, matchId, dayId, kickoff: "15:30", stage: "final", group: "", home: clubN, away: clubA, refereeId: null });
  expect((await mirrors(clubA))[0]).toMatchObject({ at: `${year}-12-05 15:30`, status: "scheduled" });
  expect((await mirrors(clubN))[0]).toMatchObject({ at: `${year}-12-05 15:30` });
  // The result, validated by the organiser: both calendars get the score, each from its side.
  const m = (await tournamentView(db, fedPresident, tournamentId)).days[0].matches[0];
  await run(fedPresident, fed, { action: "result", id: tournamentId, matchId, version: m.version, homeScore: 3, awayScore: 1, homeShootout: null, awayShootout: null, stats: [], validate: true });
  expect((await mirrors(clubA))[0]).toMatchObject({ status: "played", our_score: 1, their_score: 3 });
  expect((await mirrors(clubN))[0]).toMatchObject({ status: "played", our_score: 3, their_score: 1 });
  // A second fixture removed by the organiser is cancelled in the calendars, never deleted.
  const second = (await run(fedPresident, fed, { action: "match", id: tournamentId, matchId: null, dayId, kickoff: "17:00", stage: "third", group: "", home: clubA, away: clubN, refereeId: null })).id;
  expect((await mirrors(clubA)).map((x) => x.status)).toEqual(["played", "scheduled"]);
  await run(fedPresident, fed, { action: "removeMatch", id: tournamentId, matchId: second });
  expect((await mirrors(clubA)).map((x) => [x.status, x.tournament_match_id])).toEqual([
    ["played", matchId],
    ["cancelled", null],
  ]);
  // Club A changes its mind on the team: the played match stays with A1, nothing else.
  await run(presidentA, clubA, { action: "team", id: tournamentId, teamId: null });
  expect((await mirrors(clubA)).map((x) => [x.status, x.team_id])).toEqual([
    ["played", teamA],
    ["cancelled", teamA],
  ]);
});
