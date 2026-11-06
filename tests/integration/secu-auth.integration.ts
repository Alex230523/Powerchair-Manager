import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { MAX_FAILURES, recordSignIn, signInBlocked } from "../../src/domains/access/lockout";
import { signupAllowed } from "../../src/domains/access/signup";
import { consoleExecute } from "../../src/domains/console/service";
import { mcpAuth, mcpKeysExecute } from "../../src/domains/mcp/service";

/**
 * Security (06/11/2026), broken authentication: the failures of an address
 * counted from any machine, a good password clearing them, the address kept
 * as a hash; an operator who leaves loses his keys at the door and his
 * support accesses; a sign-up without the right invitation refused.
 */
const schema = "secauth_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let club: string, owner: Principal, support: Principal;

async function user(name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, `${userId}@example.test`]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  return { userId, sessionId };
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  const president = await user("Président A");
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, president.userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, president.userId])).rows[0].id;
  await execute(db, president, { action: "context", mandateId });
  owner = await user("Alex");
  support = await user("Sam Support");
  await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,'owner'),($2,'support')", [owner.userId, support.userId]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("refuses an address after ten failed passwords, whatever the case, and a good password clears the count", async () => {
  const email = "Dan.Leroy@Example.test";
  expect(await signInBlocked(db, email)).toBe(false);
  for (let i = 0; i < MAX_FAILURES - 1; i++) await recordSignIn(db, i % 2 ? email : email.toLowerCase(), false);
  expect(await signInBlocked(db, email)).toBe(false);
  await recordSignIn(db, " dan.leroy@example.test ", false);
  expect(await signInBlocked(db, email)).toBe(true);
  // Another address is not concerned; the address itself is never stored.
  expect(await signInBlocked(db, "eva@example.test")).toBe(false);
  expect((await db.query("SELECT count(*)::int AS n FROM auth_failure WHERE email_hash ILIKE '%leroy%'")).rows[0].n).toBe(0);
  // Fifteen minutes later, the oldest failures no longer count.
  await db.query("UPDATE auth_failure SET at=now()-interval '16 minutes'");
  expect(await signInBlocked(db, email)).toBe(false);
  await recordSignIn(db, email, false);
  await recordSignIn(db, email, true);
  expect((await db.query("SELECT count(*)::int AS n FROM auth_failure")).rows[0].n).toBe(0);
  // Nothing to count without an address.
  await recordSignIn(db, undefined, false);
  await recordSignIn(db, "", false);
  expect(await signInBlocked(db, null)).toBe(false);
});

it("refuses a sign-up without an invitation for that very address, still valid", async () => {
  const { createHash } = await import("node:crypto");
  const token = "a".repeat(64);
  await db.query("INSERT INTO invitation(organization_id,email,role,token_hash,expires_at,created_by) VALUES($1,'invited@example.test','player',$2,now()+interval '7 days',$3)", [club, createHash("sha256").update(token).digest("hex"), owner.userId]);
  expect(await signupAllowed(db, token, "Invited@Example.test ")).toBe(true);
  expect(await signupAllowed(db, token, "someone.else@example.test")).toBe(false);
  expect(await signupAllowed(db, null, "invited@example.test")).toBe(false);
  expect(await signupAllowed(db, "b".repeat(64), "invited@example.test")).toBe(false);
  expect(await signupAllowed(db, "not-hex", "invited@example.test")).toBe(false);
  await db.query("UPDATE invitation SET expires_at=now()-interval '1 minute'");
  expect(await signupAllowed(db, token, "invited@example.test")).toBe(false);
});

it("takes his keys and his support accesses from an operator who leaves", async () => {
  const created = (await mcpKeysExecute(db, support, { action: "createKey", name: "Claude de Sam", scopes: ["console:read"] })) as { id: string; key: string };
  expect((await mcpAuth(db, `Bearer ${created.key}`)).keyId).toBe(created.id);
  const borrow = (await consoleExecute(db, support, { action: "borrow", organizationId: club, reason: "Vérification du calendrier", minutes: 30 })) as { mandateId?: string };
  expect(borrow).toBeTruthy();
  expect((await db.query("SELECT count(*)::int AS n FROM platform_borrow WHERE operator_id=$1 AND ended_at IS NULL", [support.userId])).rows[0].n).toBe(1);
  await consoleExecute(db, owner, { action: "revokeOperator", userId: support.userId });
  // The key stops at the door; the support access is over, its mandate revoked, the context dropped.
  await expect(mcpAuth(db, `Bearer ${created.key}`)).rejects.toMatchObject({ status: 401 });
  expect((await db.query("SELECT revoked_at FROM operator_api_key WHERE id=$1", [created.id])).rows[0].revoked_at).not.toBeNull();
  expect((await db.query("SELECT count(*)::int AS n FROM platform_borrow WHERE operator_id=$1 AND ended_at IS NULL", [support.userId])).rows[0].n).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM role_assignment WHERE user_id=$1 AND revoked_at IS NULL", [support.userId])).rows[0].n).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM active_context WHERE user_id=$1", [support.userId])).rows[0].n).toBe(0);
  expect((await db.query("SELECT payload FROM platform_action WHERE kind='operator.revoke'")).rows[0].payload).toMatchObject({ keys: 1, borrows: 1 });
  // Even a key revived by hand would not pass: the operator himself is gone.
  await db.query("UPDATE operator_api_key SET revoked_at=NULL WHERE id=$1", [created.id]);
  await expect(mcpAuth(db, `Bearer ${created.key}`)).rejects.toMatchObject({ status: 401 });
});
