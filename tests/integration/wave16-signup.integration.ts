import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID, createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { signupAllowed } from "../../src/domains/access/signup";

/** Wave 16 (I1): a public sign-up needs a live invitation for that very email, in any club. */
const schema = "w16su_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
const token = () => randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
let clubA: string, clubB: string, inviter: string;
async function invitation(org: string, email: string, extra = "") {
  const t = token();
  await db.query(
    `INSERT INTO invitation(organization_id,email,role,token_hash,expires_at,created_by) VALUES($1,lower($2),'coach',$3,now()+interval '7 days',$4)`,
    [org, email, createHash("sha256").update(t).digest("hex"), inviter],
  );
  if (extra) await db.query(`UPDATE invitation SET ${extra} WHERE token_hash=$1`, [createHash("sha256").update(t).digest("hex")]);
  return t;
}
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  inviter = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,\'Inviter\',$2,true)', [inviter, inviter + "@example.test"]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("accepts the invited email only, whatever its case", async () => {
  const t = await invitation(clubA, "coach@example.test");
  expect(await signupAllowed(db, t, "Coach@Example.test")).toBe(true);
  expect(await signupAllowed(db, t, "someone@example.test")).toBe(false);
  expect(await signupAllowed(db, null, "coach@example.test")).toBe(false);
  expect(await signupAllowed(db, "not-a-token", "coach@example.test")).toBe(false);
  expect(await signupAllowed(db, t, undefined)).toBe(false);
});

it("refuses an expired, revoked or already used invitation, in either club", async () => {
  expect(await signupAllowed(db, await invitation(clubB, "b@example.test", "expires_at=now()-interval '1 minute'"), "b@example.test")).toBe(false);
  expect(await signupAllowed(db, await invitation(clubB, "c@example.test", "revoked_at=now()"), "c@example.test")).toBe(false);
  expect(await signupAllowed(db, await invitation(clubA, "d@example.test", "accepted_at=now()"), "d@example.test")).toBe(false);
  expect(await signupAllowed(db, await invitation(clubB, "e@example.test"), "e@example.test")).toBe(true);
});
