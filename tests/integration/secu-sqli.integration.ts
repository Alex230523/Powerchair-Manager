import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { clubExecute, clubView } from "../../src/domains/club/service";
import { consoleOrganizations } from "../../src/domains/console/service";
import { consoleSupport, supportExecute, supportView } from "../../src/domains/support/service";
import { registryView } from "../../src/domains/classification/registry";
import { financeOperations } from "../../src/domains/finance/service";

/**
 * Security (06/11/2026), SQL injection: the classic payloads, typed where a
 * person types (a club's name, a support ticket, the searches of the console,
 * of the registry and of the ledger), reach the database as text. They are
 * stored as written, found as written, and nothing else moves.
 */
const schema = "secsqli_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fed: string, club: string, other: string, president: Principal, fedPresident: Principal, owner: Principal;
const payloads = [
  "x'; DROP TABLE organization; --",
  "' OR '1'='1",
  "' OR 1=1 --",
  "'); DELETE FROM club_person; --",
  "1; UPDATE organization SET name='pwned'",
  "\\'; SELECT pg_sleep(5); --",
  "%",
  "_",
  "$1",
];

async function user(name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, `${userId}@example.test`]);
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
const counts = async () => (await db.query("SELECT (SELECT count(*) FROM organization)::int AS orgs,(SELECT count(*) FROM club_person)::int AS people,(SELECT count(*) FROM organization WHERE name='pwned')::int AS pwned")).rows[0];

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération','federation') RETURNING id")).rows[0].id;
  club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A',  'club',$1) RETURNING id", [fed])).rows[0].id;
  other = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club 50% B','club',$1) RETURNING id", [fed])).rows[0].id;
  president = await actor(club, "club_president", "Président A");
  fedPresident = await actor(fed, "federation_president", "Présidente");
  owner = await user("Alex");
  await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,'owner')", [owner.userId]);
  for (const [org, name] of [
    [club, "Dan Leroy"],
    [other, "Eva_Martin"],
  ])
    await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,directory_roles,status) SELECT $1,p.id,$2,'{player}','active' FROM p", [org, name]);
  await db.query("INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by) VALUES($1,CURRENT_DATE,'Remise 50% sponsor','in','donation',1000,$2),($1,CURRENT_DATE,'Buvette','in','other',500,$2)", [club, president.userId]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("stores a payload typed as a name or a message exactly as written, and nothing else moves", async () => {
  const before = await counts();
  for (const payload of payloads.slice(0, 6)) {
    await clubExecute(db, president, { action: "identity", name: payload, contactEmail: "" }, club);
    expect((await clubView(db, president)).organization.name).toBe(payload);
    await supportExecute(db, president, { action: "open", category: "question", subject: `Sujet ${payload}`, text: payload });
  }
  expect(await counts()).toEqual(before);
  const mine = await supportView(db, president);
  expect(mine.tickets).toHaveLength(6);
  expect(Object.values(mine.threads).map((t) => t[0].text).sort()).toEqual(payloads.slice(0, 6).sort());
  await clubExecute(db, president, { action: "identity", name: "Club A", contactEmail: "" }, club);
});

it("searches a payload as text: the console, the support desk, the registry, the ledger", async () => {
  const before = await counts();
  for (const q of payloads) {
    const t0 = Date.now();
    // Nothing called « ' OR '1'='1 » exists: an injection would bring everything back.
    const orgs = (await consoleOrganizations(db, owner, { q })).organizations.map((o) => o.name);
    const tickets = (await consoleSupport(db, owner, { q })).tickets.map((t) => t.subject);
    const players = (await registryView(db, fedPresident, q)).players.map((x) => x.full_name);
    const ledger = (await financeOperations(db, president, {}, { q })).items.map((x) => x.label);
    expect(Date.now() - t0, q).toBeLessThan(4000);
    if (q === "%") {
      expect(orgs).toEqual(["Club 50% B"]);
      // The registry also searches the club's name: Eva plays at « Club 50% B ».
      expect(players).toEqual(["Eva_Martin"]);
      expect(ledger).toEqual(["Remise 50% sponsor"]);
    } else if (q === "_") {
      expect(orgs).toEqual([]);
      expect(players).toEqual(["Eva_Martin"]);
      expect(ledger).toEqual([]);
    } else {
      expect(orgs, q).toEqual([]);
      expect(players, q).toEqual([]);
      expect(ledger, q).toEqual([]);
      expect(tickets.every((s) => s.includes(q)), q).toBe(true);
    }
  }
  // A plain search still finds what it should.
  expect((await consoleOrganizations(db, owner, { q: "club" })).organizations.map((o) => o.name).sort()).toEqual(["Club 50% B", "Club A"]);
  expect((await registryView(db, fedPresident, "leroy")).players.map((x) => x.full_name)).toEqual(["Dan Leroy"]);
  expect(await counts()).toEqual(before);
});
