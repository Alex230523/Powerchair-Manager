import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { myDataExport } from "../../src/domains/privacy/service";

/**
 * 12: « Mes données »: what the platform holds on me, in every club, and
 * never another person's data nor the health data.
 */
const schema = "t12_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, parent: Principal, other: Principal;

async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  const p = { userId, sessionId };
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  await execute(db, p, { action: "context", mandateId });
  return p;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  parent = await actor(clubA, "guardian", "Nadia Parent");
  other = await actor(clubB, "club_president", "Autre");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("gives my account, my profiles in each club and whom I represent, nothing else", async () => {
  const me = (await db.query("SELECT id FROM person WHERE user_id=$1", [parent.userId])).rows[0].id;
  const mine = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,email) VALUES($1,$2,'Nadia Parent','nadia@example.test') RETURNING id", [clubA, me])).rows[0].id;
  const child = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date) SELECT $1,p.id,'Lucas Peeters','2014-04-30' FROM p RETURNING id", [clubA])).rows[0].id;
  await db.query("INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,'Vérifié pour le test',$4)", [clubA, mine, child, other.userId]);
  await db.query("INSERT INTO player_support_profile(organization_id,profile_id,support_needs) VALUES($1,$2,'Secret médical')", [clubA, child]).catch(() => undefined);
  await db.query("INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,'Autre personne' FROM person WHERE user_id=$2", [clubB, other.userId]);
  const data = await myDataExport(db, parent);
  expect(data.account.name).toBe("Nadia Parent");
  expect(data.profiles.map((p) => [p.organization, p.full_name])).toEqual([["Club A", "Nadia Parent"]]);
  expect(data.representations.map((r) => [r.represented, r.can_edit])).toEqual([["Lucas Peeters", true]]);
  expect(data.mandates.map((m) => m.role)).toEqual(["guardian"]);
  const text = JSON.stringify(data);
  expect(text).not.toContain("Autre personne");
  expect(text).not.toContain("Secret médical");
});
