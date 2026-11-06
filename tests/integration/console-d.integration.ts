import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { consoleExecute, consoleOperators, consoleOrganization } from "../../src/domains/console/service";
import { alertItems, computeMetrics } from "../../src/domains/console/metrics";
import { mcpKeys, mcpKeysExecute } from "../../src/domains/mcp/service";
import { billingExecute } from "../../src/domains/billing/service";
import { careCommand, careExecute, securityView } from "../../src/domains/legal/service";

/**
 * Console, series D (06/11/2026): the organisation's sheet enriched (first
 * steps, timeline, probable duplicates told to the presidency and linked by
 * the club itself) and the operators' security (console sessions journaled
 * and short, the keys reviewed and revocable by the owner).
 */
const schema = "consoled_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, presidentB: Principal, owner: Principal, support: Principal, twinA: string, twinB: string, personB: string;

async function user(name: string, sessionAge = "1 hour") {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, `${userId}@example.test`]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query(`INSERT INTO session(id,"userId",token,"expiresAt","createdAt","ipAddress","userAgent") VALUES($1,$2,$3,now()+interval '1 day',now()-interval '${sessionAge}','203.0.113.7','Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36')`, [sessionId, userId, randomUUID()]);
  return { userId, sessionId };
}
async function actor(org: string, role: string, name: string) {
  const p = await user(name);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, p.userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, p.userId, role])).rows[0].id;
  await execute(db, p, { action: "context", mandateId });
  return p;
}
async function operator(name: string, role: string, sessionAge?: string) {
  const p = await user(name, sessionAge);
  await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,$2)", [p.userId, role]);
  return p;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind,company_number,address) VALUES('Club A','club','0123.456.789','Rue du Stade 1') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president", "Président A");
  presidentB = await actor(clubB, "club_president", "Présidente B");
  owner = await operator("Alex", "owner");
  support = await operator("Sam Support", "support");
  // The same person in both clubs under two identities: « Dan  Leroy » and « dan leroy », born the same day.
  const personA = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id as string;
  personB = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id as string;
  twinA = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles,status) VALUES($1,$2,'Dan  Leroy','1999-05-05','{player}','active') RETURNING id", [clubA, personA])).rows[0].id;
  twinB = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles,status) VALUES($1,$2,'dan leroy','1999-05-05','{player}','active') RETURNING id", [clubB, personB])).rows[0].id;
  await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-2027','2026-09-01','2027-06-30')", [clubA]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("shows the first steps, the timeline and the probable duplicates on the organisation's sheet", async () => {
  const plan = (await billingExecute(db, owner, { action: "plan", id: null, code: "club-an", name: "Club, annuel", amountCents: 24000, period: "year", basis: "organization", active: true })).id!;
  await billingExecute(db, owner, { action: "subscribe", organizationId: clubA, planId: plan, startedOn: "2026-11-01", note: "" });
  const a = await consoleOrganization(db, owner, clubA);
  expect(a.onboarding).toMatchObject({ done: 5, total: 9 });
  expect(Object.fromEntries(a.onboarding.steps.map((s) => [s.key, s.done]))).toMatchObject({ president: true, identity: true, season: true, players: true, subscription: true, dpa: false, team: false, match: false, paid: false });
  expect(a.timeline.map((e) => e.kind)).toEqual(["action.billing.subscribe", "president", "created", "subscription", "season"]);
  expect(a.timeline.find((e) => e.kind === "president")?.label).toBe("Président A");
  expect(a.duplicates).toEqual({ count: 1, notified_at: null });
  const b = await consoleOrganization(db, owner, clubB);
  expect(b.onboarding.done).toBe(2);
  expect(b.duplicates.count).toBe(1);
  expect((await computeMetrics(db)).duplicates).toBe(2);
});

it("tells the presidency of its duplicates (no name, journaled on both sides); the club links the identity itself", async () => {
  await expect(consoleExecute(db, support, { action: "duplicatesNotify", organizationId: clubA })).resolves.toMatchObject({ recipients: 1, count: 1 });
  expect((await consoleOrganization(db, owner, clubA)).duplicates.notified_at).not.toBeNull();
  expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE organization_id=$1 AND action='platform.duplicates_notify'", [clubA])).rows[0].n).toBe(1);
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE resource_id LIKE 'duplicates:%'")).rows[0].n).toBe(1);
  expect((await db.query("SELECT payload FROM platform_action WHERE kind='duplicates.notify'")).rows[0].payload).toEqual({ count: 1, recipients: 1 });
  expect((await consoleOrganization(db, owner, clubA)).timeline[0].kind).toBe("action.duplicates.notify");
  // The president of A sees the profile, asks Dan for the code printed on his profile in club B, links it.
  const mine = await securityView(db, presidentA);
  expect(mine.duplicates).toEqual([{ id: twinA, full_name: "Dan  Leroy" }]);
  expect((await securityView(db, presidentB)).duplicates.map((d) => d.id)).toEqual([twinB]);
  const code = (await db.query("SELECT identity_code FROM person WHERE id=$1", [personB])).rows[0].identity_code as string;
  await expect(careExecute(db, presidentA, careCommand.parse({ action: "linkIdentity", profileId: twinA, identityCode: "PFM-ZZZZZZZZZZ" }), clubA)).rejects.toMatchObject({ code: "IDENTITY_UNKNOWN" });
  await expect(careExecute(db, presidentB, careCommand.parse({ action: "linkIdentity", profileId: twinB, identityCode: code }), clubB)).rejects.toMatchObject({ code: "IDENTITY_SAME" });
  await expect(careExecute(db, presidentB, careCommand.parse({ action: "linkIdentity", profileId: twinA, identityCode: code }), clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await careExecute(db, presidentA, careCommand.parse({ action: "linkIdentity", profileId: twinA, identityCode: code.toLowerCase() }), clubA);
  expect((await db.query("SELECT person_id FROM club_person WHERE id=$1", [twinA])).rows[0].person_id).toBe(personB);
  expect((await securityView(db, presidentA)).duplicates).toEqual([]);
  expect((await consoleOrganization(db, owner, clubA)).duplicates.count).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM person WHERE identity_code<>$1 AND user_id IS NULL", [code])).rows[0].n).toBe(0);
  await expect(consoleExecute(db, support, { action: "duplicatesNotify", organizationId: clubA })).rejects.toMatchObject({ code: "NO_DUPLICATES" });
});

it("journals every console session with its address and browser, and refuses a session too old", async () => {
  const mine = await consoleOperators(db, support);
  expect(mine.sessionHours).toBe(12);
  expect(mine.sessions.map((s) => [s.operator, s.ip, s.user_agent, s.alive])).toEqual([["Sam Support", "203.0.113.7", "Chrome · Linux", true]]);
  expect(mine.sessions[0].calls).toBeGreaterThan(1);
  // The owner reads everyone's; an operator signed in 13 hours ago is sent back to the door.
  const all = await consoleOperators(db, owner);
  expect(all.sessions.map((s) => s.operator).sort()).toEqual(["Alex", "Sam Support"]);
  const late = await operator("Rita", "readonly", "13 hours");
  await expect(consoleOperators(db, late)).rejects.toMatchObject({ code: "OPERATOR_SESSION_EXPIRED" });
  expect((await db.query("SELECT count(*)::int AS n FROM operator_session_log WHERE operator_id=$1", [late.userId])).rows[0].n).toBe(0);
});

it("flags the keys to review and lets the owner revoke anyone's", async () => {
  const k = await mcpKeysExecute(db, support, { action: "createKey", name: "Claude de Sam", scopes: ["console:read"] });
  const old = await mcpKeysExecute(db, support, { action: "createKey", name: "Vieille clé", scopes: ["console:read"] });
  await db.query("UPDATE operator_api_key SET created_at=now()-interval '200 days',last_used_at=now()-interval '1 day' WHERE id=$1", [old.id]);
  const keys = await mcpKeys(db, support);
  expect(keys.keys.map((x) => [x.name, x.review])).toEqual([
    ["Claude de Sam", null],
    ["Vieille clé", "old"],
  ]);
  const review = await consoleOperators(db, owner);
  expect(review.keys.map((x) => [x.operator, x.name, x.review])).toEqual([
    ["Sam Support", "Vieille clé", "old"],
    ["Sam Support", "Claude de Sam", null],
  ]);
  expect((await consoleOperators(db, support)).keys).toHaveLength(2);
  expect((await alertItems(db)).find((i) => i.rule === "keysReview")).toMatchObject({ count: 1, detail: "Sam Support · Vieille clé (old)" });
  // Support cannot revoke the owner's key; the owner revokes Sam's old one.
  const alexKey = await mcpKeysExecute(db, owner, { action: "createKey", name: "Clé d'Alex", scopes: ["console:read"] });
  await expect(mcpKeysExecute(db, support, { action: "revokeKey", id: alexKey.id! })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await mcpKeysExecute(db, owner, { action: "revokeKey", id: old.id! });
  expect((await consoleOperators(db, owner)).keys.map((x) => x.name).sort()).toEqual(["Claude de Sam", "Clé d'Alex"]);
  expect((await alertItems(db)).find((i) => i.rule === "keysReview")).toBeUndefined();
  expect((await mcpKeys(db, support)).keys.find((x) => x.id === k.id)?.review).toBeNull();
});
