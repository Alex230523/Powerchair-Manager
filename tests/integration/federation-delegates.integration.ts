import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { staffRolesExecute, staffRolesView } from "../../src/domains/access/staff-roles";
import { designationsView, refereeView } from "../../src/domains/competitions/service";
import { federationAffiliationsView } from "../../src/domains/affiliations/service";
import { federationClubsView } from "../../src/domains/federation/clubs";
import { federationFocus } from "../../src/domains/dashboard/focus";
import { circularDetail, circularExecute, circularExport, circularsView } from "../../src/domains/circulars/service";

/**
 * 32 and 33: a referees delegate appoints but sees no finances; a referee
 * appointed keeps his referee space; a club's president appointed sees no
 * other club's private data through the federation; the home's cards follow
 * the competences; a circular with a read receipt, its reminder to the
 * unread and its export; another federation sees none of it.
 */
const schema = "fdl_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
type Who = Principal & { mandateId: string };
let fed: string, fedB: string, clubA: string, clubB: string, president: Who, presidentB: Who, referee: Who, clubPresidentA: Who, clubPresidentB: Who, delegate: Who, comms: Who;
const roles = (p: Principal, body: Record<string, unknown>, org: string) => staffRolesExecute(db, p, body as never, org) as Promise<Record<string, unknown>>;
const circ = (p: Principal, body: Record<string, unknown>, org: string) => circularExecute(db, p, body as never, org) as Promise<Record<string, unknown>>;

async function member(org: string, role: string, name: string): Promise<Who> {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id as string;
  await execute(db, { userId, sessionId }, { action: "context", mandateId });
  return { userId, sessionId, mandateId };
}
/** Another session of the same person, on another of his mandates. */
async function as(who: Who, mandateId: string): Promise<Who> {
  const sessionId = randomUUID();
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, who.userId, randomUUID()]);
  await execute(db, { userId: who.userId, sessionId }, { action: "context", mandateId });
  return { userId: who.userId, sessionId, mandateId };
}
const roleId = async (key: string) => (await db.query("SELECT id FROM staff_role WHERE organization_id=$1 AND key=$2", [fed, key])).rows[0].id as string;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération','federation') RETURNING id")).rows[0].id;
  fedB = (await db.query("INSERT INTO organization(name,kind) VALUES('Autre fédération','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [fed])).rows[0].id;
  president = await member(fed, "federation_president", "Présidence fédérale");
  presidentB = await member(fedB, "federation_president", "Autre présidence");
  referee = await member(fed, "referee", "Arbitre Délégué");
  clubPresidentA = await member(clubA, "club_president", "Président A");
  clubPresidentB = await member(clubB, "club_president", "Président B");
  await staffRolesView(db, president);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("proposes the eight delegated roles to the presidency only", async () => {
  const v = await staffRolesView(db, president);
  expect(v.roles.map((r) => r.key)).toEqual(["referees-lead", "competitions-lead", "discipline-lead", "classification-lead", "licences-lead", "courses-lead", "communication", "federation-treasurer"]);
  expect(v.candidates.map((c) => c.name)).toEqual(["Arbitre Délégué", "Président A", "Président B"]);
  await expect(roles(clubPresidentA, { action: "appoint", userId: referee.userId, roleIds: [await roleId("referees-lead")] }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  // Someone outside this federation's world cannot be appointed.
  await expect(roles(president, { action: "appoint", userId: presidentB.userId, roleIds: [await roleId("referees-lead")] }, fed)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("lets a referees delegate appoint but not see the finances, and keeps his referee space", async () => {
  const id = (await roles(president, { action: "appoint", userId: referee.userId, roleIds: [await roleId("referees-lead")] }, fed)).id as string;
  expect((await db.query("SELECT grants FROM role_assignment WHERE id=$1", [id])).rows[0].grants).toEqual(["federation.referees"]);
  delegate = await as(referee, id);
  expect((await designationsView(db, delegate)).can.manage).toBe(true);
  await expect(federationAffiliationsView(db, delegate)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(federationClubsView(db, delegate)).rejects.toMatchObject({ code: "FORBIDDEN" });
  // His referee profile still opens his own space.
  expect(await refereeView(db, referee)).toBeTruthy();
  // The journal keeps the appointment.
  expect((await staffRolesView(db, president)).journal.map((j) => j.action)).toContain("delegate.appointed");
});

it("gives a club's president appointed for the licences nothing of a club's private data", async () => {
  const before = (await db.query("SELECT grants,revoked_at FROM role_assignment WHERE id=$1", [clubPresidentA.mandateId])).rows[0];
  const id = (await roles(president, { action: "appoint", userId: clubPresidentA.userId, roleIds: [await roleId("licences-lead")] }, fed)).id as string;
  const asDelegate = await as(clubPresidentA, id);
  expect((await federationClubsView(db, asDelegate)).can.manage).toBe(true);
  const grants = (await db.query("SELECT grants FROM role_assignment WHERE id=$1", [id])).rows[0].grants as string[];
  expect(grants).toEqual(["federation.licences"]);
  expect(grants.some((g) => ["people.sensitive", "dues.read", "dues.manage", "documents.sensitive"].includes(g))).toBe(false);
  // His club presidency is untouched.
  expect((await db.query("SELECT grants,revoked_at FROM role_assignment WHERE id=$1", [clubPresidentA.mandateId])).rows[0]).toEqual(before);
});

it("shows the home's cards according to the competences", async () => {
  const c = await db.connect();
  try {
    await c.query(`SET search_path=${schema},public`);
    const referees = await federationFocus(c, fed, { licences: false, competitions: false, referees: true, classification: false, courses: false, communication: false });
    expect(referees.clubs).toEqual({ affiliated: 0, pending: 0 });
    const licences = await federationFocus(c, fed, { licences: true, competitions: false, referees: false, classification: false, courses: false, communication: false });
    expect(licences.clubs).toEqual({ affiliated: 2, pending: 0 });
    expect(licences.matchesWithoutReferee).toBe(0);
  } finally {
    c.release();
  }
});

it("sends a circular with a read receipt, reminds the unread and exports the follow-up", async () => {
  const id = (await roles(president, { action: "appoint", userId: clubPresidentB.userId, roleIds: [await roleId("communication")] }, fed)).id as string;
  comms = await as(clubPresidentB, id);
  await expect(circ(delegate, { action: "save", title: "Calendrier", body: "Texte", audiences: ["presidents"] }, fed)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const c = (await circ(comms, { action: "save", title: "Nouveau règlement", body: "Le règlement change au 1er janvier.", audiences: ["presidents", "referees"], ackRequired: true }, fed)).id as string;
  await circ(comms, { action: "addFile", id: c, filename: "reglement.pdf", mediaType: "application/pdf", data: Buffer.from("%PDF-1.4 test").toString("base64") }, fed);
  await expect(circ(comms, { action: "addFile", id: c, filename: "x.pdf", mediaType: "application/pdf", data: Buffer.from("not a pdf").toString("base64") }, fed)).rejects.toMatchObject({ code: "INVALID_FILE" });
  expect((await circ(comms, { action: "send", id: c }, fed)).sent).toBe(3);
  // Club A's president reads it (opening marks it read) and acknowledges it.
  const mine = await circularsView(db, clubPresidentA);
  expect(mine.mine.map((x) => x.title)).toEqual(["Nouveau règlement"]);
  const detail = await circularDetail(db, clubPresidentA, c);
  expect(detail.files.map((f) => f.filename)).toEqual(["reglement.pdf"]);
  await circ(clubPresidentA, { action: "ack", id: c }, clubA);
  // The reminder goes to the two who have not acknowledged.
  expect((await circ(comms, { action: "remind", id: c }, fed)).sent).toBe(2);
  const follow = (await circularDetail(db, comms, c)).followUp;
  expect(follow.find((o) => o.name === "Club A")).toMatchObject({ recipients: 1, read: 1, acknowledged: 1, waiting: [] });
  const csv = await circularExport(db, comms, c);
  expect(csv.split("\n")).toHaveLength(4);
  expect(csv).toContain("Club A;Président A;");
  // Another federation sees nothing of it.
  await expect(circularDetail(db, presidentB, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await circularsView(db, presidentB)).circulars).toEqual([]);
});
