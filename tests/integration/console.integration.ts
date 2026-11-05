import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { consoleExecute, consoleHome, consoleOperators, consoleOrganization, consoleOrganizations, consoleSupervision, envOperators, isOperator } from "../../src/domains/console/service";

/**
 * Console, step 1 (05/11/2026): only an operator enters; the console reads
 * counts and states of every organisation, never a player's personal
 * data; the notes and the operators' changes are journaled; a club
 * president, even of two clubs, is refused.
 */
const schema = "console_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fed: string, clubA: string, clubB: string, president: Principal, owner: Principal, support: Principal, reader: Principal, ownerEmail: string;

async function user(name: string, email = `${randomUUID()}@example.test`) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, email]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  return { userId, sessionId };
}
async function actor(org: string, role: string, name: string) {
  const p = await user(name);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, p.userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, p.userId, role])).rows[0].id;
  await execute(db, p, { action: "context", mandateId });
  return p;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('BPCF','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id,country_code,created_at) VALUES('Club B','club',$1,'NL',now()-interval '90 days') RETURNING id", [fed])).rows[0].id;
  president = await actor(clubA, "club_president", "Président A");
  await actor(fed, "federation_president", "Présidente");
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles,status,phone) VALUES($1,$2,'Mina Petit','2012-03-03','{player}','active','0470 11 22 33')", [clubA, person]);
  ownerEmail = `owner-${randomUUID()}@example.test`;
  owner = await user("Alex", ownerEmail);
  process.env.PFM_OPERATOR_EMAILS = ` ${ownerEmail.toUpperCase()} , `;
  support = await user("Sam Support");
  reader = await user("Rita Lecture");
});
afterAll(async () => {
  delete process.env.PFM_OPERATOR_EMAILS;
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("lets only an operator in: the owner from the configuration, the others added by the owner", async () => {
  expect(envOperators({ PFM_OPERATOR_EMAILS: " A@x.test, b@x.test " } as NodeJS.ProcessEnv)).toEqual(["a@x.test", "b@x.test"]);
  await expect(consoleHome(db, president)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(consoleHome(db, support)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await isOperator(db, president)).toBe(false);
  expect(await isOperator(db, owner)).toBe(true);
  const home = await consoleHome(db, owner);
  expect(home.operator).toEqual({ name: "Alex", role: "owner" });
  // Only the owner adds operators; the account must exist.
  await expect(consoleExecute(db, owner, { action: "addOperator", email: "nobody@example.test", role: "support" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const supportEmail = (await db.query('SELECT email FROM "user" WHERE id=$1', [support.userId])).rows[0].email;
  await consoleExecute(db, owner, { action: "addOperator", email: supportEmail, role: "support" });
  const readerEmail = (await db.query('SELECT email FROM "user" WHERE id=$1', [reader.userId])).rows[0].email;
  await consoleExecute(db, owner, { action: "addOperator", email: readerEmail, role: "readonly" });
  await expect(consoleExecute(db, support, { action: "addOperator", email: readerEmail, role: "owner" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  const ops = await consoleOperators(db, support);
  expect(ops.me.role).toBe("support");
  expect(ops.operators.map((o) => [o.name, o.role, o.revoked_at])).toEqual([
    ["Sam Support", "support", null],
    ["Rita Lecture", "readonly", null],
  ]);
  expect(ops.fromEnvironment).toBe(1);
});

it("reads counts and states, never a player's personal data, and journals the notes", async () => {
  const home = await consoleHome(db, support);
  expect(home.organizations).toMatchObject({ clubs: 2, federations: 1 });
  expect(home.organizations.byCountry).toEqual([
    { country: "BE", federations: 1, clubs: 1 },
    { country: "NL", federations: 0, clubs: 1 },
  ]);
  expect(home.people.players).toBe(1);
  expect(home.compliance).toMatchObject({ noPresident: 1, minorsWithoutGuardian: 1, noDpa: 2 });
  expect(home.todos.find((x) => x.key === "noPresident")).toMatchObject({ count: 1, organizations: [{ name: "Club B" }] });
  expect(home.todos.find((x) => x.key === "inactive60")).toMatchObject({ count: 1, organizations: [{ name: "Club B" }] });
  expect(JSON.stringify(home)).not.toContain("Mina");
  const list = await consoleOrganizations(db, reader, { q: "club", kind: "club", country: "" });
  expect(list.organizations.map((o) => [o.name, o.country, o.federation, o.players, o.presidents])).toEqual([
    ["Club A", "BE", "BPCF", 1, 1],
    ["Club B", "NL", "BPCF", 0, 0],
  ]);
  expect(list.countries).toEqual(["BE", "NL"]);
  expect((await consoleOrganizations(db, reader, { country: "NL" })).organizations.map((o) => o.name)).toEqual(["Club B"]);
  // The sheet: figures and officers; the e-mail of an officer only for those who answer support.
  const sheet = await consoleOrganization(db, support, clubA);
  expect(sheet.organization).toMatchObject({ name: "Club A", kind: "club", members: 1, players: 1, coaches: 0, teams: 0, data_requests_open: 0, api_keys: 0 });
  expect(sheet.officers.map((o) => [o.name, o.role, typeof o.email])).toEqual([["Président A", "club_president", "string"]]);
  expect((await consoleOrganization(db, reader, clubA)).officers[0].email).toBeNull();
  expect(JSON.stringify(sheet)).not.toContain("Mina");
  await expect(consoleOrganization(db, reader, randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
  // Notes: support and owner write, read only reads; each note is an intervention.
  await expect(consoleExecute(db, reader, { action: "note", organizationId: clubA, text: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await consoleExecute(db, support, { action: "note", organizationId: clubA, text: "Appel du président : question sur les cotisations." });
  const again = await consoleOrganization(db, owner, clubA);
  expect(again.notes.map((n) => [n.text, n.operator])).toEqual([["Appel du président : question sur les cotisations.", "Sam Support"]]);
  expect(again.actions.map((a) => [a.kind, a.operator])).toEqual([["note", "Sam Support"]]);
  expect((await consoleHome(db, owner)).recentActions.map((a) => a.kind)).toEqual(["note", "operator.add", "operator.add"]);
  const sup = await consoleSupervision(db, reader);
  expect(sup.jobs.length).toBeGreaterThan(3);
  expect(Array.isArray(sup.migrations)).toBe(true);
  expect(sup.feedback).toEqual([]);
  // Revoking: never oneself; a revoked operator is out.
  await expect(consoleExecute(db, owner, { action: "revokeOperator", userId: owner.userId })).rejects.toMatchObject({ code: "SELF_REVOKE" });
  await consoleExecute(db, owner, { action: "revokeOperator", userId: reader.userId });
  await expect(consoleHome(db, reader)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await consoleOperators(db, owner)).operators.find((o) => o.user_id === reader.userId)?.revoked_at).not.toBeNull();
});
