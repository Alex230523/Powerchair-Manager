import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { clubFederationView } from "../../src/domains/federation-page/service";
import { clubExecute } from "../../src/domains/club/service";

/**
 * 12/11/2026, the « Fédération » page of a club, on the real database. Club
 * A and club C in federation 1, club B in federation 2: club A's page shows
 * its federation's circulars to this person, its open tournaments, the
 * transfers it validated, club A's discipline to its presidency and coaches
 * only, and one card per club of federation 1 (president, founding year,
 * home hall, titles) but never club B; a club without a federation gets
 * none of it.
 */
const schema = "fedpage_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fed1: string, fed2: string, clubA: string, clubB: string, clubC: string, presidentA: Principal, playerA: Principal, presidentB: Principal, alone: Principal, fedPresident: Principal;

async function member(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, `${userId}@example.test`]);
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
  fed1 = (await db.query("INSERT INTO organization(name,kind,contact_email) VALUES('Fédération Une','federation','contact@fed1.test') RETURNING id")).rows[0].id;
  fed2 = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération Deux','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id,city) VALUES('Club A','club',$1,'Namur') RETURNING id", [fed1])).rows[0].id;
  clubC = (await db.query("INSERT INTO organization(name,kind,federation_id,city,founded_year) VALUES('Club C','club',$1,'Liège',1998) RETURNING id", [fed1])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [fed2])).rows[0].id;
  const lonely = (await db.query("INSERT INTO organization(name,kind) VALUES('Club seul','club') RETURNING id")).rows[0].id;
  presidentA = await member(clubA, "club_president", "Présidente A");
  playerA = await member(clubA, "player", "Joueur A");
  presidentB = await member(clubB, "club_president", "Président B");
  alone = await member(lonely, "club_president", "Président seul");
  fedPresident = await member(fed1, "federation_president", "Fédé");
  await member(clubC, "club_president", "Claire Président");
  // Club C: a home hall and two titles (one not publishable).
  await db.query("INSERT INTO calendar_place(organization_id,name,home) VALUES($1,'Hall du Parc',true)", [clubC]);
  const creator = presidentA.userId;
  await db.query("INSERT INTO award(organization_id,awarded_on,title,kind,place,publishable,created_by) VALUES($1,'2025-06-01','Coupe de printemps','team',1,true,$2),($1,'2024-06-01','Coupe privée','team',1,false,$2)", [clubC, creator]);
  // A circular to the president of A, a tournament of federation 1, one of federation 2.
  const circular = (await db.query("INSERT INTO circular(federation_id,title,body,audiences,status,sent_at,created_by) VALUES($1,'Calendrier de la saison','Texte','{presidents}','sent',now(),$2) RETURNING id", [fed1, fedPresident.userId])).rows[0].id;
  await db.query("INSERT INTO circular_recipient(circular_id,user_id,organization_id) VALUES($1,$2,$3)", [circular, presidentA.userId, clubA]);
  const t1 = (await db.query("INSERT INTO tournament(organization_id,name,year,format) VALUES($1,'Coupe Une',2026,'league') RETURNING id", [fed1])).rows[0].id;
  await db.query("INSERT INTO tournament_day(tournament_id,day,venue) VALUES($1,CURRENT_DATE+10,'Salle Une')", [t1]);
  await db.query("INSERT INTO tournament(organization_id,name,year,format) VALUES($1,'Coupe Deux',2026,'league')", [fed2]);
  // A sanction and a fine for club A.
  await db.query("INSERT INTO discipline_sanction(federation_id,organization_id,target,cause,season,matches,kinds,status,appeal_until) VALUES($1,$2,'club','manual','2026-27',0,'{fine}','confirmed',CURRENT_DATE+5)", [fed1, clubA]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("shows club A its federation: circulars, tournaments, discipline and the clubs of federation 1 only", async () => {
  const v = await clubFederationView(db, presidentA);
  if (!("clubs" in v)) throw new Error("no federation");
  expect(v.federation).toMatchObject({ name: "Fédération Une", contact_email: "contact@fed1.test" });
  expect(v.circulars.map((x) => x.title)).toEqual(["Calendrier de la saison"]);
  expect(v.unread).toBe(1);
  expect(v.tournaments.map((x) => [x.name, x.venue])).toEqual([["Coupe Une", "Salle Une"]]);
  expect(v.discipline).toMatchObject({ sanctions: 1, appealable: 1 });
  expect(v.clubs.map((x) => x.name)).toEqual(["Club A", "Club C"]);
  const c = v.clubs.find((x) => x.name === "Club C")!;
  expect(c).toMatchObject({ city: "Liège", founded_year: 1998, presidents: ["Claire Président"], home: "Hall du Parc", titles: 1, last_title: "Coupe de printemps 2025", mine: false });
  expect(v.clubs[0].mine).toBe(true);
  expect(JSON.stringify(v)).not.toContain("Club B");
  expect(JSON.stringify(v)).not.toContain("Coupe Deux");
});

it("keeps the discipline to the presidency and coaches, and the circulars to their recipients", async () => {
  const v = await clubFederationView(db, playerA);
  if (!("clubs" in v)) throw new Error("no federation");
  expect(v.discipline).toBeNull();
  expect(v.can.discipline).toBe(false);
  expect(v.circulars).toEqual([]);
  expect(v.clubs.map((x) => x.name)).toEqual(["Club A", "Club C"]);
});

it("shows club B its own federation, a club without one nothing, and refuses a federation", async () => {
  const b = await clubFederationView(db, presidentB);
  if (!("clubs" in b)) throw new Error("no federation");
  expect(b.clubs.map((x) => x.name)).toEqual(["Club B"]);
  expect(JSON.stringify(b)).not.toContain("Club A");
  expect(await clubFederationView(db, alone)).toEqual({ federation: null });
  await expect(clubFederationView(db, fedPresident)).rejects.toMatchObject({ code: "CLUB_ONLY", status: 403 });
});

it("records the founding year from the club's settings, within its bounds", async () => {
  await clubExecute(db, presidentA, { action: "identity", name: "Club A", contactEmail: "", foundedYear: 2004 }, clubA);
  expect((await db.query("SELECT founded_year FROM organization WHERE id=$1", [clubA])).rows[0].founded_year).toBe(2004);
  await expect(clubExecute(db, presidentA, { action: "identity", name: "Club A", contactEmail: "", foundedYear: 1700 } as never, clubA)).rejects.toBeTruthy();
  // Omitted: unchanged.
  await clubExecute(db, presidentA, { action: "identity", name: "Club A", contactEmail: "" }, clubA);
  expect((await db.query("SELECT founded_year FROM organization WHERE id=$1", [clubA])).rows[0].founded_year).toBe(2004);
});
