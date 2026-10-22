import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { sheetView, threadsView, transferExecute, transfersView } from "../../src/domains/transfers/service";
import { federationLicensesView } from "../../src/domains/federation/service";

/**
 * Wave 17 (J3): the transfer market. A player who did not consent stays
 * invisible, a minor shows only with a parent's agreement, the API never
 * gives personal data, a request outside the window is refused, the
 * conversation belongs to the two clubs, the player agrees before any
 * acceptance, and the federation's validation moves the player.
 */
const schema = "w17tr_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let federation: string, clubA: string, clubB: string, clubC: string;
let fed: Principal, presidentA: Principal, presidentB: Principal, presidentC: Principal, coachA: Principal, ana: Principal, chloe: Principal, dan: Principal, parent: Principal;
let anaPerson: string, bilalPerson: string, chloePerson: string, danPerson: string, anaProfile: string, today: string, offer: string;

async function actor(org: string, role: string | null, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, `${userId}@example.test`]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const p = { userId, sessionId };
  if (role) {
    const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
    await execute(db, p, { action: "context", mandateId });
  }
  return p;
}
async function profile(org: string, name: string, birth: string, user: Principal | null, status = "active", email = "") {
  const person = user ? (await db.query("SELECT id FROM person WHERE user_id=$1", [user.userId])).rows[0].id : (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  const id = (
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles,status,email,phone) VALUES($1,$2,$3,$4,'{player}',$5,$6,'0470 11 22 33') RETURNING id", [
      org,
      person,
      name,
      birth,
      status,
      email || null,
    ])
  ).rows[0].id as string;
  return { id, person: person as string };
}
const run = (p: Principal, org: string, command: Record<string, unknown>) => transferExecute(db, p, command as never, org) as Promise<{ ok: true; id?: string }>;
const names = async (p: Principal) => (await transfersView(db, p)).players.map((x) => [x.full_name, x.club ?? "Sans club"]);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  today = (await db.query("SELECT (now() AT TIME ZONE 'Europe/Brussels')::date::text AS d")).rows[0].d;
  federation = (await db.query("INSERT INTO organization(name,kind) VALUES('BPCF','federation') RETURNING id")).rows[0].id;
  const other = (await db.query("INSERT INTO organization(name,kind) VALUES('Autre','federation') RETURNING id")).rows[0].id;
  const club = async (name: string, f: string, province = "") => (await db.query("INSERT INTO organization(name,kind,federation_id,province) VALUES($1,'club',$2,$3) RETURNING id", [name, f, province])).rows[0].id as string;
  clubA = await club("Club A", federation, "namur");
  clubB = await club("Club B", federation, "liege");
  clubC = await club("Club C", other);
  fed = await actor(federation, "federation_president", "Fédé");
  presidentA = await actor(clubA, "club_president", "Président A");
  presidentB = await actor(clubB, "club_president", "Président B");
  presidentC = await actor(clubC, "club_president", "Président C");
  coachA = await actor(clubA, "coach", "Coach A");
  ana = await actor(clubA, "player", "Ana Martin");
  chloe = await actor(clubA, "player", "Chloé Petit");
  dan = await actor(clubB, "player", "Dan Leroy");
  parent = await actor(clubA, "guardian", "Parent de Bilal");
  const a = await profile(clubA, "Ana Martin", "1998-04-02", ana, "active", "ana@example.test");
  anaPerson = a.person;
  anaProfile = a.id;
  const bilal = await profile(clubA, "Bilal Haddad", "2012-06-01", null);
  bilalPerson = bilal.person;
  chloePerson = (await profile(clubA, "Chloé Petit", "1999-01-01", chloe)).person;
  danPerson = (await profile(clubB, "Dan Leroy", "1990-01-01", dan, "inactive")).person;
  const parentProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,'Parent de Bilal' FROM person WHERE user_id=$2 RETURNING id", [clubA, parent.userId])).rows[0].id;
  await db.query("INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,verified_by) VALUES($1,$2,$3,'declared',$4)", [clubA, parentProfile, bilal.id, presidentA.userId]);
  // Ana played: a team, a match, a prize.
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2025-26','2025-07-01','2026-06-30') RETURNING id", [clubA])).rows[0].id;
  const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player','2025-08-01')", [clubA, team, anaProfile]);
  const match = (await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,status,our_score,their_score,created_by) VALUES($1,$2,'Lions','friendly','2025-10-12 14:00+02','played',3,1,$3) RETURNING id", [clubA, team, presidentA.userId])).rows[0].id;
  await db.query("INSERT INTO match_player(match_id,organization_id,profile_id,minutes,goals,assists) VALUES($1,$2,$3,40,2,1)", [match, clubA, anaProfile]);
  await db.query("INSERT INTO award(organization_id,season_id,awarded_on,title,competition,kind,place,team_id,created_by) VALUES($1,$2,'2026-05-01','Coupe de Belgique','Coupe',\'team\',2,$3,$4)", [clubA, season, team, presidentA.userId]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("shows only players who chose it: the adult player, or a parent for a minor", async () => {
  expect(await names(presidentB)).toEqual([]);
  // The club cannot decide in their place; another player neither.
  await expect(run(presidentA, clubA, { action: "visibility", personId: anaPerson, visible: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(run(ana, clubA, { action: "visibility", personId: bilalPerson, visible: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(ana, clubA, { action: "visibility", personId: anaPerson, visible: true });
  await run(parent, clubA, { action: "visibility", personId: bilalPerson, visible: true });
  expect((await transfersView(db, parent)).mine).toEqual([expect.objectContaining({ person_id: bilalPerson, minor: true, visible: true, can: true })]);
  expect(await names(presidentB)).toEqual([
    ["Ana Martin", "Club A"],
    ["Bilal Haddad", "Club A"],
  ]);
  // Withdrawn at once, then back.
  await run(ana, clubA, { action: "visibility", personId: anaPerson, visible: false });
  expect((await names(presidentB)).map((x) => x[0])).toEqual(["Bilal Haddad"]);
  await run(ana, clubA, { action: "visibility", personId: anaPerson, visible: true });
  // Another federation sees nobody; a player of club A does not read the market.
  expect(await names(presidentC)).toEqual([]);
  expect((await transfersView(db, chloe)).players).toEqual([]);
  expect((await names(presidentB)).map((x) => x[0])).not.toContain("Chloé Petit");
  void chloePerson;
});

it("keeps a player without club visible when they chose so", async () => {
  await run(dan, clubB, { action: "visibility", personId: danPerson, visible: true });
  expect(await names(presidentA)).toEqual([
    ["Ana Martin", "Club A"],
    ["Bilal Haddad", "Club A"],
    ["Dan Leroy", "Sans club"],
  ]);
});

it("gives sporting information only, never personal data", async () => {
  const view = await transfersView(db, presidentB);
  const row = view.players.find((x) => x.full_name === "Ana Martin")!;
  expect(Object.keys(row).sort()).toEqual(["age", "classification", "club", "club_id", "full_name", "key", "own", "province", "seasons", "team"]);
  expect(row).toMatchObject({ province: "namur", classification: "not_classified", age: "26to40", seasons: 1, own: false });
  const sheet = await sheetView(db, presidentB, anaPerson);
  expect(sheet.stats).toEqual([{ season: "2025-26", club: "Club A", matches: 1, minutes: 40, goals: 2, assists: 1 }]);
  expect(sheet.clubs).toEqual([{ club: "Club A", seasons: "2025-26" }]);
  expect(sheet.prizes).toMatchObject([{ title: "Coupe de Belgique", place: 2 }]);
  expect(sheet.canRequest).toBe(true);
  const text = JSON.stringify([view, sheet]);
  for (const secret of ["ana@example.test", "0470 11 22 33", "1998-04-02", "2012-06-01"]) expect(text).not.toContain(secret);
  expect((await sheetView(db, presidentA, anaPerson)).canRequest).toBe(false);
  await expect(sheetView(db, presidentC, anaPerson)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(sheetView(db, presidentB, chloePerson)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("follows the federation's rules: window, amount, own players", async () => {
  const rules = { windows: [{ from: "2020-01-01", to: "2020-02-01" }], amountsAllowed: false, amountCapCents: null, maxPerClubSeason: 1, federationValidation: true, rulesText: "Transferts en juin." };
  await expect(run(presidentA, clubA, { action: "rules", rules })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(fed, federation, { action: "rules", rules });
  const ask = { action: "request", personId: anaPerson, season: "2026-27", amountCents: null, message: "Nous aimerions t'accueillir." };
  await expect(run(presidentB, clubB, ask)).rejects.toMatchObject({ code: "MARKET_CLOSED" });
  await run(fed, federation, { action: "rules", rules: { ...rules, windows: [{ from: today, to: today }] } });
  await expect(run(presidentB, clubB, { ...ask, amountCents: 10000 })).rejects.toMatchObject({ code: "AMOUNT_NOT_ALLOWED" });
  await run(fed, federation, { action: "rules", rules: { ...rules, windows: [{ from: today, to: today }], amountsAllowed: true, amountCapCents: 50000 } });
  await expect(run(presidentB, clubB, { ...ask, amountCents: 60000 })).rejects.toMatchObject({ code: "AMOUNT_NOT_ALLOWED" });
  await expect(run(presidentA, clubA, ask)).rejects.toMatchObject({ code: "OWN_PLAYER" });
  await expect(run(presidentC, clubC, ask)).rejects.toMatchObject({ code: "NOT_FOUND" });
  offer = (await run(presidentB, clubB, { ...ask, amountCents: 10000 })).id!;
  await expect(run(presidentB, clubB, ask)).rejects.toMatchObject({ code: "DUPLICATE" });
  const told = (await db.query("SELECT DISTINCT recipient_user_id FROM mail_job WHERE resource_id=$1", [offer])).rows.map((r) => r.recipient_user_id);
  expect(told).toEqual(expect.arrayContaining([presidentA.userId, ana.userId]));
  expect(told).not.toContain(presidentC.userId);
  expect((await transfersView(db, presidentB)).rules.rulesText).toBe("Transferts en juin.");
});

it("keeps the conversation to the two clubs", async () => {
  await run(presidentA, clubA, { action: "message", id: offer, body: "Parlons-en." });
  await run(presidentB, clubB, { action: "message", id: offer, body: "Avec plaisir." });
  await expect(run(presidentC, clubC, { action: "message", id: offer, body: "Moi aussi" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(run(coachA, clubA, { action: "message", id: offer, body: "Et moi" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(run(ana, clubA, { action: "message", id: offer, body: "Et moi" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  const a = (await threadsView(db, presidentA)).threads;
  expect(a[0].messages.map((m) => [m.club, m.body])).toEqual([
    ["Club A", "Parlons-en."],
    ["Club B", "Avec plaisir."],
  ]);
  expect(a[0].status).toBe("discussing");
  expect((await threadsView(db, presidentC)).threads).toEqual([]);
  expect((await threadsView(db, coachA)).threads).toEqual([]);
});

it("waits for the player's agreement, then for the federation", async () => {
  await expect(run(presidentA, clubA, { action: "answer", id: offer, decision: "accepted", note: "" })).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
  expect((await transfersView(db, ana)).consents.map((o) => o.id)).toEqual([offer]);
  await expect(run(presidentA, clubA, { action: "consent", id: offer, consent: "given" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(ana, clubA, { action: "consent", id: offer, consent: "given" });
  await expect(run(presidentB, clubB, { action: "answer", id: offer, decision: "accepted", note: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(presidentA, clubA, { action: "answer", id: offer, decision: "accepted", note: "Bonne route" });
  // Nothing moves before the federation validates.
  expect((await db.query("SELECT status FROM club_person WHERE id=$1", [anaProfile])).rows[0].status).toBe("active");
  expect((await federationLicensesView(db, fed)).toValidate).toBe(1);
  const pending = (await transfersView(db, fed)).offers.find((o) => o.id === offer)!;
  expect(pending.moves).toEqual(["validate", "refuse"]);
  await expect(run(presidentA, clubA, { action: "validate", id: offer, decision: "validated", note: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(fed, federation, { action: "validate", id: offer, decision: "validated", note: "" });
  expect((await db.query("SELECT status FROM club_person WHERE id=$1", [anaProfile])).rows[0].status).toBe("transferred");
  const moved = (await db.query("SELECT organization_id,status,directory_roles FROM club_person WHERE person_id=$1 AND organization_id=$2", [anaPerson, clubB])).rows[0];
  expect(moved).toMatchObject({ status: "active", directory_roles: ["player"] });
  expect((await db.query("SELECT status FROM transfer_offer WHERE id=$1", [offer])).rows[0].status).toBe("validated");
  // It shows in the federation's licences list, like a token transfer.
  expect((await federationLicensesView(db, fed)).transfers.map((x) => [x.full_name, x.from_club, x.to_club, x.status])).toContainEqual(["Ana Martin", "Club A", "Club B", "accepted"]);
  // The maximum per club and season (1) is reached for club B.
  await expect(run(presidentB, clubB, { action: "request", personId: bilalPerson, season: "2026-27", amountCents: null, message: "" })).rejects.toMatchObject({ code: "TRANSFER_LIMIT" });
});

it("sends a request for a player without club to the player, then the federation", async () => {
  const id = (await run(presidentA, clubA, { action: "request", personId: danPerson, season: "2026-27", amountCents: null, message: "Reviens jouer" })).id!;
  expect((await db.query("SELECT from_organization_id FROM transfer_offer WHERE id=$1", [id])).rows[0].from_organization_id).toBeNull();
  await run(dan, clubB, { action: "consent", id, consent: "given" });
  expect((await db.query("SELECT status FROM transfer_offer WHERE id=$1", [id])).rows[0].status).toBe("accepted");
  await run(fed, federation, { action: "validate", id, decision: "validated", note: "" });
  expect((await db.query("SELECT status FROM club_person WHERE person_id=$1 AND organization_id=$2", [danPerson, clubA])).rows[0].status).toBe("active");
});

it("asks a parent, not the club nor the child, for a minor", async () => {
  await run(fed, federation, { action: "rules", rules: { windows: [], amountsAllowed: false, amountCapCents: null, maxPerClubSeason: null, federationValidation: false, rulesText: "" } });
  const id = (await run(presidentB, clubB, { action: "request", personId: bilalPerson, season: "2026-27", amountCents: null, message: "" })).id!;
  await expect(run(presidentA, clubA, { action: "consent", id, consent: "given" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(parent, clubA, { action: "consent", id, consent: "given" });
  // Without federation validation, the acceptance moves the player at once.
  await run(presidentA, clubA, { action: "answer", id, decision: "accepted", note: "" });
  expect((await db.query("SELECT status FROM club_person WHERE person_id=$1 AND organization_id=$2", [bilalPerson, clubB])).rows[0].status).toBe("active");
  expect((await db.query("SELECT status,completed_at IS NOT NULL AS done FROM transfer_offer WHERE id=$1", [id])).rows[0]).toEqual({ status: "accepted", done: true });
});
