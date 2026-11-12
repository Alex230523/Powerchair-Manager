import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { MAX_FAILURES, recordSignIn } from "../../src/domains/access/lockout";
import { consoleExecute, consoleSupervision } from "../../src/domains/console/service";
import { limit } from "../../src/lib/rate-limit";
import { securityEvent } from "../../src/domains/security/events";
import { securityTick } from "../../src/domains/security/alerts";
import type { Transport } from "../../src/domains/notifications/transport";

/**
 * Security (07/11/2026), missing logging and alerting, on the real database.
 * Club A and club B. An address locked after ten wrong passwords, a flood
 * refused, a support access, an operator added: each written once in the
 * security journal (a fingerprint, never the address or the e-mail). The
 * journals cannot be rewritten nor shortened before twelve months. The
 * security task e-mails the owners: a critical event at once, three lockouts
 * in fifteen minutes, never twice the same rule in the hour; the journal past
 * twelve months goes.
 */
const schema = "seclog_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, owner: Principal, support: Principal;
const sent: { email: string; subject: string; text: string }[] = [];
const transport: Transport = { mode: "local", send: async (_id, e) => (sent.push({ email: e.email, subject: e.subject, text: e.text }), "local") };

async function user(name: string, email = `${randomUUID()}@example.test`) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, email]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  return { userId, sessionId };
}
const count = async (kind: string) => (await db.query("SELECT count(*)::int AS n FROM security_event WHERE kind=$1", [kind])).rows[0].n as number;

beforeAll(async () => {
  process.env.PFM_RATE_LIMIT_SCALE = "";
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await user("Présidente A");
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [clubA, presidentA.userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [clubA, presidentA.userId])).rows[0].id;
  await execute(db, presidentA, { action: "context", mandateId });
  owner = await user("Alex", "alex.owner@example.test");
  support = await user("Sam Support");
  await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,'owner'),($2,'support')", [owner.userId, support.userId]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("writes each attack once, with a fingerprint, never the address or the e-mail", async () => {
  for (let i = 0; i < MAX_FAILURES + 2; i++) await recordSignIn(db, "Dan.Leroy@Example.test", false);
  expect(await count("auth.lockout")).toBe(1);
  const lock = (await db.query("SELECT source,details,severity FROM security_event WHERE kind='auth.lockout'")).rows[0];
  expect(lock.source).toMatch(/^[0-9a-f]{32}$/);
  expect(JSON.stringify(lock)).not.toMatch(/leroy|example/i);
  expect(lock).toMatchObject({ severity: "warning", details: { failures: 10 } });
  for (let i = 0; i < 13; i++) await limit(db, "public-write", "hash-of-an-address").catch(() => undefined);
  expect(await count("rate.limited")).toBe(1);
  // A support access on club A: journaled with club A, never club B.
  const b = (await consoleExecute(db, support, { action: "borrow", organizationId: clubA, reason: "Vérification du calendrier", minutes: 30 })) as { id: string };
  expect((await db.query("SELECT organization_id,actor_id FROM security_event WHERE kind='support.borrow'")).rows).toEqual([{ organization_id: clubA, actor_id: support.userId }]);
  await consoleExecute(db, support, { action: "borrowEnd", id: b.id });
  expect((await db.query("SELECT count(*)::int AS n FROM security_event WHERE organization_id=$1", [clubB])).rows[0].n).toBe(0);
});

it("keeps the journals as written: no change, no deletion before twelve months", async () => {
  await db.query("INSERT INTO audit_log(organization_id,actor_id,action,target_id) VALUES($1,$2,'test.recent',$3)", [clubA, presidentA.userId, clubA]);
  await db.query("INSERT INTO audit_log(organization_id,actor_id,action,target_id,created_at) VALUES($1,$2,'test.old',$3,now()-interval '13 months')", [clubA, presidentA.userId, clubA]);
  await expect(db.query("UPDATE audit_log SET action='hidden' WHERE action='test.recent'")).rejects.toMatchObject({ code: "42501" });
  await expect(db.query("DELETE FROM audit_log WHERE action='test.recent'")).rejects.toMatchObject({ code: "42501" });
  expect((await db.query("DELETE FROM audit_log WHERE action='test.old'")).rowCount).toBe(1);
  await expect(db.query("UPDATE platform_action SET reason='x'")).rejects.toMatchObject({ code: "42501" });
  await expect(db.query("DELETE FROM security_event")).rejects.toMatchObject({ code: "42501" });
  await expect(db.query("UPDATE security_event SET severity='info'")).rejects.toMatchObject({ code: "42501" });
});

it("alerts the owners within minutes, once per rule and hour, and drops the journal past twelve months", async () => {
  sent.length = 0;
  // Two lockouts so far would not alert; the support access (one) does, at once.
  let r = await securityTick(db, { BETTER_AUTH_URL: "https://pfm.example" }, transport);
  expect(sent.map((s) => s.subject)).toEqual(["Alerte de sécurité : Accès de support ouvert sur une organisation"]);
  expect(sent[0].email).toBe("alex.owner@example.test");
  expect(sent[0].text).toContain("support.borrow : 1");
  expect(r).toMatchObject({ alerts: 1, recipients: 1 });
  // An operator added: critical, alerted; three lockouts in fifteen minutes: alerted.
  const newcomer = await user("Nouvel opérateur", "new.operator@example.test");
  await consoleExecute(db, owner, { action: "addOperator", email: "new.operator@example.test", role: "support" });
  expect((await db.query("SELECT severity,details FROM security_event WHERE kind='operator.added'")).rows[0]).toMatchObject({ severity: "critical", details: { userId: newcomer.userId, role: "support" } });
  for (const k of ["a", "b"]) await securityEvent(db, "auth.lockout", { source: k.repeat(32) });
  sent.length = 0;
  r = await securityTick(db, {}, transport);
  expect(sent.map((s) => s.subject).sort()).toEqual(["Alerte de sécurité : Adresses bloquées après des mots de passe faux (attaque par identifiants possible)", "Alerte de sécurité : Événement critique"]);
  // The same hour again: nothing more.
  sent.length = 0;
  await securityEvent(db, "cron.unauthorized", { source: "c".repeat(32) });
  await securityTick(db, {}, transport);
  expect(sent).toEqual([]);
  // A year and more: gone.
  await db.query("INSERT INTO security_event(kind,severity,source,created_at) VALUES('key.invalid','warning','old',now()-interval '13 months')");
  r = await securityTick(db, {}, transport);
  expect(r.purged).toBe(1);
  // The console reads the journal and the alerts.
  const sup = await consoleSupervision(db, owner);
  expect(sup.security.events.map((e) => e.kind)).toContain("operator.added");
  expect(sup.security.alerts.map((a) => a.rule).sort()).toEqual(["borrow", "critical", "lockouts"]);
});
