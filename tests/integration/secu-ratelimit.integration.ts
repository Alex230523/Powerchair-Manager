import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { supportExecute } from "../../src/domains/support/service";
import { assistantTurn } from "../../src/domains/assistant/service";
import { clientKey, limit, RateLimited, throttle } from "../../src/lib/rate-limit";

/**
 * Security (07/11/2026), missing rate limiting, on the real database. Club A
 * and club B: a form without an account stops at its tenth request from one
 * address, another address goes on, the next window starts again; the scale
 * raises a limit; a president who sends invitations in a loop stops at the
 * thirtieth, the other club's president does not; a support thread too; an
 * operator past his tokens of the day is refused before the model is called.
 */
const schema = "secrate_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let presidentA: Principal, presidentB: Principal, operator: Principal;
const noScale = { PFM_RATE_LIMIT_SCALE: "" };
const from = (ip: string) => new Request("https://pfm.example/api/registrations/guest", { method: "POST", headers: { "x-real-ip": ip } });

async function user(name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, `${userId}@example.test`]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  return { userId, sessionId };
}
async function president(club: string, name: string) {
  const p = await user(name);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, p.userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, p.userId])).rows[0].id;
  await execute(db, p, { action: "context", mandateId });
  return p;
}

beforeAll(async () => {
  // The scale of the CI stays out of this file: the real limits are tested.
  process.env.PFM_RATE_LIMIT_SCALE = "";
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  const clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  const clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await president(clubA, "Présidente A");
  presidentB = await president(clubB, "Président B");
  operator = await user("Alex");
  await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,'owner')", [operator.userId]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("stops a form without an account at its tenth request from one address, and only that address", async () => {
  for (let i = 0; i < 10; i++) await throttle(db, from("203.0.113.7"), "public-write");
  const refused = await throttle(db, from("203.0.113.7"), "public-write").catch((e) => e);
  expect(refused).toBeInstanceOf(RateLimited);
  expect(refused).toMatchObject({ code: "RATE_LIMITED", status: 429 });
  expect(refused.retryAfter).toBeGreaterThanOrEqual(1);
  expect(refused.retryAfter).toBeLessThanOrEqual(600);
  // Another address goes on; the address itself is never stored.
  await throttle(db, from("198.51.100.4"), "public-write");
  expect((await db.query("SELECT count(*)::int AS n FROM rate_counter WHERE key LIKE '%203.0.113%'")).rows[0].n).toBe(0);
  expect((await db.query("SELECT key FROM rate_counter WHERE bucket='public-write' ORDER BY count DESC LIMIT 1")).rows[0].key).toBe(clientKey(from("203.0.113.7")));
  // The next window starts again.
  await db.query("UPDATE rate_counter SET window_start=window_start-interval '10 minutes'");
  await throttle(db, from("203.0.113.7"), "public-write");
  // The scale raises a limit (never removes it).
  for (let i = 0; i < 15; i++) await limit(db, "public-write", "scaled", { PFM_RATE_LIMIT_SCALE: "2" });
  await expect(limit(db, "public-write", "scaled", noScale)).rejects.toBeInstanceOf(RateLimited);
});

it("stops a president who sends invitations in a loop, not the other club's", async () => {
  for (let i = 0; i < 30; i++) await execute(db, presidentA, { action: "invite", email: `loop${i}@example.test`, role: "player", grants: [], validUntil: null });
  await expect(execute(db, presidentA, { action: "invite", email: "loop30@example.test", role: "player", grants: [], validUntil: null })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect((await db.query("SELECT count(*)::int AS n FROM invitation WHERE created_by=$1", [presidentA.userId])).rows[0].n).toBe(30);
  // Resending counts too.
  const one = (await db.query("SELECT id FROM invitation WHERE created_by=$1 LIMIT 1", [presidentA.userId])).rows[0].id;
  await expect(execute(db, presidentA, { action: "resendInvitation", id: one })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  await execute(db, presidentB, { action: "invite", email: "welcome@example.test", role: "player", grants: [], validUntil: null });
});

it("stops a support thread written in a loop", async () => {
  await supportExecute(db, presidentB, { action: "open", category: "question", subject: "Question", text: "Bonjour" });
  const ticket = (await db.query("SELECT id FROM support_ticket WHERE user_id=$1", [presidentB.userId])).rows[0].id;
  for (let i = 0; i < 29; i++) await supportExecute(db, presidentB, { action: "reply", id: ticket, text: `Message ${i}` });
  await expect(supportExecute(db, presidentB, { action: "reply", id: ticket, text: "Encore" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect((await db.query("SELECT count(*)::int AS n FROM support_message WHERE ticket_id=$1", [ticket])).rows[0].n).toBe(30);
});

it("refuses the assistant to an operator past his tokens of the day, before calling the model", async () => {
  await db.query("INSERT INTO operator_assistant_usage(operator_id,day,calls,input_tokens,output_tokens) VALUES($1,CURRENT_DATE,90,800000,200000)", [operator.userId]);
  let called = false;
  await expect(
    assistantTurn(db, operator, { locale: "fr", messages: [{ role: "user", content: "Bonjour" }] }, async () => {
      called = true;
      throw new Error("never");
    }),
  ).rejects.toMatchObject({ code: "ASSISTANT_QUOTA", status: 429 });
  expect(called).toBe(false);
});
