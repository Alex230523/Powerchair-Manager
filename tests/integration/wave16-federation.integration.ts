import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, workspace, type Principal } from "../../src/domains/access/service";
import { welcomeView, welcomeComplete } from "../../src/domains/access/invite";
import { federationClubsView, federationClubsExecute, federationTeamsView, federationRefereesView } from "../../src/domains/federation/clubs";

/** Wave 16 (I3): a federation creates its clubs, invites presidents and referees; two federations. */
const schema = "w16fed_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fedA: string, fedB: string, presidentA: Principal, workerA: Principal, presidentB: Principal;

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
/** The account the guided creation makes, then the invitation accepted through it. */
async function accept(email: string, token: string) {
  const id = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,false)', [id, "x", email]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [id]);
  await welcomeComplete(db, token, id, { action: "create", firstName: "Nouveau", lastName: "Président", birthDate: null, phone: "", locale: "fr", password: "un-mot-de-passe-solide", privacy: true, classification: null, chair: null, care: "" });
  return id;
}
/** The raw token only travels in the (sealed) email: the tests give the pending invitation a token they know. */
async function token(email: string) {
  const raw = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  const { createHash } = await import("node:crypto");
  await db.query("UPDATE invitation SET token_hash=$2 WHERE lower(email)=lower($1) AND accepted_at IS NULL AND revoked_at IS NULL", [email, createHash("sha256").update(raw).digest("hex")]);
  return raw;
}
const newClub = (by: Principal, org: string, name: string, president: string, affiliationNumber = "") =>
  federationClubsExecute(
    db,
    by,
    { action: "createClub", name, city: "Namur", affiliationNumber, companyNumber: "", legalForm: "asbl", contactEmail: "", president: { firstName: "Claire", lastName: "Présidente", email: president } },
    org,
  );

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fedA = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération A','federation') RETURNING id")).rows[0].id;
  fedB = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération B','federation') RETURNING id")).rows[0].id;
  presidentA = await actor(fedA, "federation_president");
  workerA = await actor(fedA, "federation_worker");
  presidentB = await actor(fedB, "federation_president");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

let club: string;
it("creates a club and invites its president, who arrives in the club", async () => {
  club = (await newClub(presidentA, fedA, "Lions de Namur", "claire@example.test", "BPCF-012")).id!;
  let view = await federationClubsView(db, presidentA);
  expect(view.clubs).toEqual([
    expect.objectContaining({ name: "Lions de Namur", city: "Namur", affiliation_number: "BPCF-012", status: "pending", president: null, invitation: expect.objectContaining({ email: "claire@example.test", status: "pending" }) }),
  ]);
  expect((await db.query("SELECT action FROM audit_log WHERE organization_id=$1 AND action<>'context.changed' ORDER BY created_at", [fedA])).rows.map((r) => r.action)).toEqual(["federation.clubCreated", "invitation.created"]);
  // Same affiliation number in the same federation: refused.
  await expect(newClub(presidentA, fedA, "Doublon", "x@example.test", "bpcf-012")).rejects.toMatchObject({ code: "AFFILIATION_TAKEN" });
  const raw = await token("claire@example.test");
  expect(await welcomeView(db, raw)).toMatchObject({ state: "valid", organization: "Lions de Namur", role: "club_president", sport: false });
  const claire = await accept("claire@example.test", raw);
  const mandate = (await db.query("SELECT id FROM role_assignment WHERE organization_id=$1 AND user_id=$2 AND role='club_president'", [club, claire])).rows[0].id;
  expect(mandate).toBeTruthy();
  const session = randomUUID();
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [session, claire, randomUUID()]);
  await execute(db, { userId: claire, sessionId: session }, { action: "context", mandateId: mandate });
  expect((await workspace(db, { userId: claire, sessionId: session })).selected).toMatchObject({ organization_id: club, role: "club_president" });
  view = await federationClubsView(db, presidentA);
  expect(view.clubs[0]).toMatchObject({ status: "active", president: { email: "claire@example.test" } });
});

it("keeps every club to its own federation", async () => {
  expect((await federationClubsView(db, presidentB)).clubs).toEqual([]);
  expect((await federationTeamsView(db, presidentB)).teams).toEqual([]);
  await expect(federationClubsExecute(db, presidentB, { action: "invitePresident", clubId: club, firstName: "Pirate", lastName: "B", email: "pirate@example.test" }, fedB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // A federation worker reads but does not create.
  expect((await federationClubsView(db, workerA)).can.manage).toBe(false);
  await expect(newClub(workerA, fedA, "Par le travailleur", "w@example.test")).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("shows the teams of the season, never health or money", async () => {
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
  const team = (await db.query("INSERT INTO team(organization_id,season_id,name,category,level) VALUES($1,$2,'Lions U18','U18','Régional') RETURNING id", [club, season])).rows[0].id;
  const player = (
    await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,'Zoé Martin','2010-01-01','{player}' FROM p RETURNING id", [club])
  ).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-1)", [club, team, player]);
  const teams = (await federationTeamsView(db, presidentA)).teams;
  expect(teams).toEqual([expect.objectContaining({ club: "Lions de Namur", name: "Lions U18", category: "U18", level: "Régional", players: 1, licensed: 0, coaches: "" })]);
  const text = JSON.stringify([teams, (await federationClubsView(db, presidentA)).clubs]);
  for (const secret of ["Zoé", "2010-01-01", "health", "amount", "dues", "iban"]) expect(text).not.toContain(secret);
});

it("changes the president without leaving the club without one", async () => {
  await federationClubsExecute(db, presidentA, { action: "invitePresident", clubId: club, firstName: "Marc", lastName: "Nouveau", email: "marc@example.test" }, fedA);
  // Until Marc accepts, Claire stays president.
  expect((await federationClubsView(db, presidentA)).clubs[0]).toMatchObject({ president: { email: "claire@example.test" }, invitation: { email: "marc@example.test", succession: true, status: "pending" } });
  // The sitting president cannot cancel or send it again from the club.
  const invitation = (await db.query("SELECT id FROM invitation WHERE email='marc@example.test'")).rows[0].id;
  const claireId = (await db.query('SELECT id FROM "user" WHERE email=$1', ["claire@example.test"])).rows[0].id;
  const s = randomUUID();
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [s, claireId, randomUUID()]);
  const mandate = (await db.query("SELECT id FROM role_assignment WHERE organization_id=$1 AND user_id=$2", [club, claireId])).rows[0].id;
  await execute(db, { userId: claireId, sessionId: s }, { action: "context", mandateId: mandate });
  await expect(execute(db, { userId: claireId, sessionId: s }, { action: "resendInvitation", id: invitation })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(execute(db, { userId: claireId, sessionId: s }, { action: "cancelInvitation", id: invitation })).rejects.toMatchObject({ code: "NOT_FOUND" });
  // The federation sends it again; then Marc accepts and Claire's mandate ends.
  await federationClubsExecute(db, presidentA, { action: "resendInvitation", id: invitation }, fedA);
  const marc = await accept("marc@example.test", await token("marc@example.test"));
  const presidents = (await db.query("SELECT user_id FROM role_assignment WHERE organization_id=$1 AND role='club_president' AND revoked_at IS NULL", [club])).rows.map((r) => r.user_id);
  expect(presidents).toEqual([marc]);
});

it("refuses a president invitation once its federation sender is gone", async () => {
  const other = (await newClub(presidentA, fedA, "Tigres de Liège", "tigre@example.test")).id!;
  const raw = await token("tigre@example.test");
  await db.query("UPDATE role_assignment SET revoked_at=now() WHERE user_id=$1", [presidentA.userId]);
  const id = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,false)', [id, "x", "tigre@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [id]);
  await expect(
    welcomeComplete(db, raw, id, { action: "create", firstName: "T", lastName: "L", birthDate: null, phone: "", locale: "fr", password: "un-mot-de-passe-solide", privacy: true, classification: null, chair: null, care: "" }),
  ).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  expect((await db.query("SELECT count(*)::int AS n FROM role_assignment WHERE organization_id=$1", [other])).rows[0].n).toBe(0);
  await db.query("UPDATE role_assignment SET revoked_at=NULL WHERE user_id=$1", [presidentA.userId]);
});

it("invites referees into the federation, sends again and cancels", async () => {
  await federationClubsExecute(db, presidentA, { action: "inviteReferee", firstName: "Rita", lastName: "Arbitre", email: "rita@example.test" }, fedA);
  let view = await federationRefereesView(db, presidentA);
  expect(view.invitations).toEqual([expect.objectContaining({ email: "rita@example.test", name: "Rita Arbitre", status: "pending" })]);
  await expect(federationClubsExecute(db, presidentB, { action: "cancelInvitation", id: view.invitations[0].id }, fedB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await federationClubsExecute(db, presidentA, { action: "resendInvitation", id: view.invitations[0].id }, fedA);
  view = await federationRefereesView(db, presidentA);
  expect(view.invitations).toHaveLength(1);
  const rita = await accept("rita@example.test", await token("rita@example.test"));
  view = await federationRefereesView(db, presidentA);
  expect(view.referees.map((r) => r.id)).toEqual([rita]);
  expect(view.invitations).toEqual([]);
  await federationClubsExecute(db, presidentA, { action: "inviteReferee", firstName: "Paul", lastName: "Arbitre", email: "paul@example.test" }, fedA);
  const paul = (await federationRefereesView(db, presidentA)).invitations[0].id;
  await federationClubsExecute(db, presidentA, { action: "cancelInvitation", id: paul }, fedA);
  expect((await federationRefereesView(db, presidentA)).invitations).toEqual([]);
  expect((await federationRefereesView(db, presidentB)).referees).toEqual([]);
});
