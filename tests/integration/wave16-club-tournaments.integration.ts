import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { tournamentsView } from "../../src/domains/tournaments/service";

/** Wave 16 (E3): the club's own tournaments on the tournaments page, two clubs. */
const schema = "w16ct_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, playerA: Principal, presidentB: Principal;
const year = new Date().getFullYear();

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

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president");
  playerA = await actor(clubA, "player");
  presidentB = await actor(clubB, "club_president");
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',make_date($2,1,1),make_date($2,12,31)) RETURNING id", [clubA, year])).rows[0].id;
  const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions') RETURNING id", [clubA, season])).rows[0].id;
  // A past tournament: 2nd of 8, two matches played on those days; another one coming, with a vehicle.
  await db.query(
    "INSERT INTO trip(organization_id,title,kind,starts_on,ends_on,final_rank,teams_count,result_note,created_by,status) VALUES($1,'Coupe de Namur','tournament',make_date($2,1,10),make_date($2,1,11),2,8,'Finale perdue',$3,'done')",
    [clubA, year, presidentA.userId],
  );
  for (const [opponent, our, their, d] of [
    ["Tigres", 3, 1, 10],
    ["Aigles", 1, 2, 11],
  ] as const)
    await db.query(
      "INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,status,our_score,their_score,created_by) VALUES($1,$2,$3,'tournament',make_timestamptz($4,1,$5,14,0,0,'Europe/Brussels'),'played',$6,$7,$8)",
      [clubA, team, opponent, year, d, our, their, presidentA.userId],
    );
  const coming = (
    await db.query("INSERT INTO trip(organization_id,title,kind,starts_on,ends_on,created_by) VALUES($1,'Tournoi de Liège','tournament',make_date($2,12,30),make_date($2,12,30),$3) RETURNING id", [clubA, year, presidentA.userId])
  ).rows[0].id;
  await db.query("INSERT INTO trip_vehicle(trip_id,name,seats,wheelchair_places) VALUES($1,'Minibus',6,2)", [coming]);
  await db.query("INSERT INTO trip(organization_id,title,kind,starts_on,ends_on,created_by) VALUES($1,'Voyage B','tournament',make_date($2,6,1),make_date($2,6,1),$3)", [clubB, year, presidentB.userId]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("shows the club's coming and past tournaments, with places and matches", async () => {
  const view = await tournamentsView(db, presidentA, year);
  const trips = view.clubTrips!;
  expect(trips.past.map((x) => [x.title, x.final_rank, x.teams_count])).toEqual([["Coupe de Namur", 2, 8]]);
  expect(trips.past[0].matches.map((m) => [m.opponent, m.our, m.their])).toEqual([
    ["Tigres", 3, 1],
    ["Aigles", 1, 2],
  ]);
  expect(trips.upcoming).toEqual([expect.objectContaining({ title: "Tournoi de Liège", vehicles: 1, wheelchair_places: 2 })]);
  expect(trips.prepare?.teams.map((x) => x.name)).toEqual(["Lions"]);
  expect(trips.prepare?.typeId).toBeTruthy();
});

it("keeps each club to its own trips, and players out of it", async () => {
  const b = (await tournamentsView(db, presidentB, year)).clubTrips!;
  expect([...b.upcoming, ...b.past].map((x) => x.title)).toEqual(["Voyage B"]);
  expect((await tournamentsView(db, playerA, year)).clubTrips).toBeNull();
  await db.query("UPDATE organization SET disabled_modules='{trips}' WHERE id=$1", [clubA]);
  expect((await tournamentsView(db, presidentA, year)).clubTrips).toBeNull();
  await db.query("UPDATE organization SET disabled_modules='{}' WHERE id=$1", [clubA]);
});
