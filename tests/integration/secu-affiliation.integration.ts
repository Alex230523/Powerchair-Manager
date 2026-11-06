import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { clubExecute, clubView } from "../../src/domains/club/service";
import { federationClubsCommand, federationClubsExecute, federationClubsView } from "../../src/domains/federation/clubs";

/**
 * Security (06/11/2026), Broken Access Control: a club president could attach
 * the club to any federation and read, through it, that federation's transfer
 * market (players by name), circulars, trainings and clubs' teams. Now choosing
 * a federation only asks; the federation accepts or refuses; leaving stays free.
 */
const schema = "secaff_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fedA: string, fedB: string, club: string, president: Principal, fedPresidentA: Principal, fedPresidentB: Principal, otherClubPresident: Principal;

async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, `${userId}@example.test`]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  await execute(db, { userId, sessionId }, { action: "context", mandateId });
  return { userId, sessionId };
}
const federationOf = async () => (await db.query("SELECT federation_id,federation_request_id FROM organization WHERE id=$1", [club])).rows[0] as { federation_id: string | null; federation_request_id: string | null };

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fedA = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération A','federation') RETURNING id")).rows[0].id;
  fedB = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération B','federation') RETURNING id")).rows[0].id;
  club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club indépendant','club') RETURNING id")).rows[0].id;
  const other = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club de A','club',$1) RETURNING id", [fedA])).rows[0].id as string;
  president = await actor(club, "club_president", "Président du club");
  fedPresidentA = await actor(fedA, "federation_president", "Présidente A");
  fedPresidentB = await actor(fedB, "federation_president", "Président B");
  otherClubPresident = await actor(other, "club_president", "Président voisin");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("asks instead of attaching: the club stays outside until the federation accepts", async () => {
  await clubExecute(db, president, { action: "identity", name: "Club indépendant", contactEmail: "", federationId: fedA }, club);
  expect(await federationOf()).toEqual({ federation_id: null, federation_request_id: fedA });
  const view = await clubView(db, president);
  expect(view.organization).toMatchObject({ federation_id: null, federation_request_id: fedA, federation_request_name: "Fédération A" });
  // Federation A sees the request (and was told); federation B does not.
  const a = await federationClubsView(db, fedPresidentA);
  expect(a.requests.map((r) => [r.name, r.requested_by])).toEqual([["Club indépendant", "Président du club"]]);
  expect(a.clubs.map((c) => c.name)).toEqual(["Club de A"]);
  expect((await federationClubsView(db, fedPresidentB)).requests).toEqual([]);
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE resource_id LIKE $1", [`affiliation_request:${club}:%`])).rows[0].n).toBe(1);
  // Asking again for the same federation changes nothing.
  await clubExecute(db, president, { action: "identity", name: "Club indépendant", contactEmail: "", federationId: fedA }, club);
  expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='club.federation_requested'")).rows[0].n).toBe(1);
});

it("lets only the federation asked decide", async () => {
  // Federation B, a club president, a club of A: none of them can accept.
  await expect(federationClubsExecute(db, fedPresidentB, federationClubsCommand.parse({ action: "acceptClub", clubId: club }), fedB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(federationClubsExecute(db, otherClubPresident, federationClubsCommand.parse({ action: "acceptClub", clubId: club }))).rejects.toMatchObject({ status: 403 });
  expect((await federationOf()).federation_id).toBeNull();
  // Refused: nothing attached, the request gone, the club told.
  await federationClubsExecute(db, fedPresidentA, federationClubsCommand.parse({ action: "refuseClub", clubId: club }), fedA);
  expect(await federationOf()).toEqual({ federation_id: null, federation_request_id: null });
  // Asked again, then accepted: attached.
  await clubExecute(db, president, { action: "identity", name: "Club indépendant", contactEmail: "", federationId: fedA }, club);
  await federationClubsExecute(db, fedPresidentA, federationClubsCommand.parse({ action: "acceptClub", clubId: club }), fedA);
  expect(await federationOf()).toEqual({ federation_id: fedA, federation_request_id: null });
  expect((await federationClubsView(db, fedPresidentA)).clubs.map((c) => c.name)).toEqual(["Club de A", "Club indépendant"]);
  await expect(federationClubsExecute(db, fedPresidentA, federationClubsCommand.parse({ action: "acceptClub", clubId: club }), fedA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await db.query("SELECT action FROM audit_log WHERE organization_id=$1 AND action LIKE 'club.federation_%' ORDER BY created_at", [club])).rows.map((r) => r.action)).toEqual([
    "club.federation_requested",
    "club.federation_refused",
    "club.federation_requested",
    "club.federation_accepted",
  ]);
});

it("moves to another federation only once that one accepts, and leaves freely", async () => {
  await clubExecute(db, president, { action: "identity", name: "Club indépendant", contactEmail: "", federationId: fedB }, club);
  expect(await federationOf()).toEqual({ federation_id: fedA, federation_request_id: fedB });
  expect((await federationClubsView(db, fedPresidentB)).requests[0]).toMatchObject({ name: "Club indépendant", current_federation: "Fédération A" });
  await federationClubsExecute(db, fedPresidentB, federationClubsCommand.parse({ action: "acceptClub", clubId: club }), fedB);
  expect(await federationOf()).toEqual({ federation_id: fedB, federation_request_id: null });
  expect((await db.query("SELECT 1 FROM audit_log WHERE organization_id=$1 AND action='federation.club_left' AND target_id=$2", [fedA, club])).rowCount).toBe(1);
  await clubExecute(db, president, { action: "identity", name: "Club indépendant", contactEmail: "", federationId: null }, club);
  expect(await federationOf()).toEqual({ federation_id: null, federation_request_id: null });
  // A federation that does not exist, or a club given as a federation: refused.
  await expect(clubExecute(db, president, { action: "identity", name: "Club indépendant", contactEmail: "", federationId: randomUUID() }, club)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
