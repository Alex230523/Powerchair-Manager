import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { staffRolesExecute } from "../../src/domains/access/staff-roles";
import { presidencyExecute } from "../../src/domains/access/presidency";
import { consoleExecute } from "../../src/domains/console/service";
import { integrationsExecute } from "../../src/domains/integrations/public";
import { apiAuth } from "../../src/domains/integrations/api";
import { emitWebhook } from "../../src/domains/integrations/webhooks";
import { orgMcpAuth } from "../../src/domains/mcp/organization";
import { bankExecute } from "../../src/domains/bank/service";
import { clubExecute } from "../../src/domains/club/service";
import { registryView } from "../../src/domains/classification/registry";

/**
 * Security (07/11/2026), badly defined permissions. Club A, club B and their
 * federation:
 * - a delegate allowed to invite cannot hand out, through a staff role, a
 *   right he does not hold himself; nor can an invitation written earlier;
 * - a platform operator's support access opens the club but never changes
 *   who holds it, never leaves a key or a hook, never moves the money;
 * - a key or a hook of the club stops with the presidency that created it;
 * - the federation's registry is read by the competences that use it.
 */
const schema = "secauthz_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fed: string, clubA: string, clubB: string;
let presidentA: Principal & { mandateId: string }, presidentB: Principal & { mandateId: string }, delegate: Principal & { mandateId: string }, support: Principal, owner: Principal;
let treasurer: string, helper: string;

async function user(name: string, email = `${randomUUID()}@example.test`) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, email]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  return { userId, sessionId };
}
async function actor(org: string, role: string, name: string, grants: string[] = [], email?: string) {
  const p = await user(name, email);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, p.userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, p.userId, role, grants])).rows[0].id as string;
  await execute(db, p, { action: "context", mandateId });
  return { ...p, mandateId };
}
/** An invitation written straight in the database (as an older one would be), with its token. */
async function invitation(org: string, by: string, email: string, role: string, extra: { staff?: string[]; grants?: string[]; succession?: boolean } = {}) {
  const token = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  await db.query(
    "INSERT INTO invitation(organization_id,email,role,grants,token_hash,expires_at,created_by,staff_role_ids,succession) VALUES($1,$2,$3,$8,$4,now()+interval '7 days',$5,$6,$7)",
    [org, email, role, createHash("sha256").update(token).digest("hex"), by, extra.staff ?? [], extra.succession ?? false, extra.grants ?? []],
  );
  return token;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id,iban) VALUES('Club A','club',$1,'BE68539007547034') RETURNING id", [fed])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [fed])).rows[0].id;
  presidentA = await actor(clubA, "club_president", "Présidente A");
  presidentB = await actor(clubB, "club_president", "Président B");
  // A coach allowed to invite, who reads the calendar: nothing about money.
  delegate = await actor(clubA, "coach", "Coach délégué", ["invitations.create", "calendar.read"]);
  treasurer = (await db.query("INSERT INTO staff_role(organization_id,name,grants,scope) VALUES($1,$2,'{dues.read,dues.manage}','all') RETURNING id", [clubA, JSON.stringify({ fr: "Trésorier", nl: "", en: "" })])).rows[0].id;
  helper = (await db.query("INSERT INTO staff_role(organization_id,name,grants,scope) VALUES($1,$2,'{calendar.read}','all') RETURNING id", [clubA, JSON.stringify({ fr: "Aide", nl: "", en: "" })])).rows[0].id;
  owner = await user("Alex");
  support = await user("Sam Support");
  await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,'owner'),($2,'support')", [owner.userId, support.userId]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("never lets a delegate hand out, through a staff role, a right he does not hold", async () => {
  // The treasurer's role carries the money: refused at once.
  await expect(execute(db, delegate, { action: "invite", email: "new.coach@example.test", role: "coach", grants: [], validUntil: null, staffRoleIds: [treasurer] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await db.query("SELECT count(*)::int AS n FROM invitation WHERE organization_id=$1", [clubA])).rows[0].n).toBe(0);
  // A role within his own rights: fine.
  await execute(db, delegate, { action: "invite", email: "helper@example.test", role: "coach", grants: [], validUntil: null, staffRoleIds: [helper] });
  // An invitation written earlier with the treasurer's role, by the delegate (the grid prefilled from the role, as the form does): refused.
  const newcomer = await user("Nouveau", "newcomer@example.test");
  const forged = await invitation(clubA, delegate.userId, "newcomer@example.test", "coach", { staff: [treasurer] });
  const forgedGrid = await invitation(clubA, delegate.userId, "newcomer@example.test", "coach", { staff: [helper], grants: ["dues.manage"] });
  await expect(execute(db, newcomer, { action: "accept", token: forgedGrid })).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  await expect(execute(db, newcomer, { action: "accept", token: forged })).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  expect((await db.query("SELECT count(*)::int AS n FROM role_assignment WHERE user_id=$1", [newcomer.userId])).rows[0].n).toBe(0);
  // The same, sent by the presidency: accepted, with the treasurer's rights.
  const real = await invitation(clubA, presidentA.userId, "newcomer@example.test", "coach", { staff: [treasurer], grants: ["dues.read", "dues.manage"] });
  await execute(db, newcomer, { action: "accept", token: real });
  expect((await db.query("SELECT grants FROM role_assignment WHERE user_id=$1", [newcomer.userId])).rows[0].grants.sort()).toEqual(["dues.manage", "dues.read"]);
});

it("opens the club to a support access, never its mandates, its keys or its money", async () => {
  const borrow = (await consoleExecute(db, support, { action: "borrow", organizationId: clubA, reason: "Vérifier la page des cotisations", minutes: 30 })) as { id: string; mandateId: string };
  await execute(db, support, { action: "context", mandateId: borrow.mandateId });
  const limited = { code: "SUPPORT_LIMITED" };
  await expect(execute(db, support, { action: "invite", email: "friend@example.test", role: "club_president", grants: [], validUntil: null })).rejects.toMatchObject(limited);
  await expect(execute(db, support, { action: "grants", id: delegate.mandateId, grants: ["dues.manage"] })).rejects.toMatchObject(limited);
  await expect(execute(db, support, { action: "revoke", id: presidentA.mandateId })).rejects.toMatchObject(limited);
  await expect(execute(db, support, { action: "membership", userId: presidentA.userId, active: false })).rejects.toMatchObject(limited);
  await expect(presidencyExecute(db, support, { action: "handOver", userId: null, email: "friend@example.test", name: "", effectiveOn: null, keep: "none", message: "" }, clubA)).rejects.toMatchObject(limited);
  await expect(staffRolesExecute(db, support, { action: "save", id: helper, name: { fr: "Aide" }, grants: ["dues.manage"], scope: "all", confirm: true }, clubA)).rejects.toMatchObject(limited);
  await expect(integrationsExecute(db, support, { action: "createKey", name: "Clé support", scopes: ["read:teams"] }, clubA)).rejects.toMatchObject(limited);
  await expect(integrationsExecute(db, support, { action: "createMcpKey", name: "Claude support", scopes: ["club:read"] }, clubA)).rejects.toMatchObject(limited);
  await expect(integrationsExecute(db, support, { action: "createHook", url: "https://hooks.example/x", events: ["match.validated"] }, clubA)).rejects.toMatchObject(limited);
  await expect(bankExecute(db, support, { action: "account", label: "Compte", iban: "BE71096123456769", bic: "", holder: "", forDues: true }, clubA)).rejects.toMatchObject(limited);
  await expect(clubExecute(db, support, { action: "identity", name: "Club A", contactEmail: "", iban: "BE71096123456769" }, clubA)).rejects.toMatchObject(limited);
  // What support is for still works: the club's name, with its IBAN unchanged.
  await clubExecute(db, support, { action: "identity", name: "Club A (corrigé)", contactEmail: "", iban: "BE68539007547034" }, clubA);
  expect((await db.query("SELECT name,iban FROM organization WHERE id=$1", [clubA])).rows[0]).toEqual({ name: "Club A (corrigé)", iban: "BE68539007547034" });
  // Nothing was left behind.
  for (const t of ["api_key", "organization_mcp_key", "webhook", "bank_account"]) expect((await db.query(`SELECT count(*)::int AS n FROM ${t} WHERE organization_id=$1`, [clubA])).rows[0].n, t).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM invitation WHERE organization_id=$1 AND role='club_president'", [clubA])).rows[0].n).toBe(0);
  await consoleExecute(db, support, { action: "borrowEnd", id: borrow.id });
  // The presidency itself still does all of it.
  await integrationsExecute(db, presidentA, { action: "createKey", name: "Site du club", scopes: ["read:teams"] }, clubA);
});

it("stops a key or a hook with the presidency that created it, in its club only", async () => {
  const keyA = (await integrationsExecute(db, presidentA, { action: "createKey", name: "Site", scopes: ["read:teams"] }, clubA)) as { key: string };
  const mcpA = (await integrationsExecute(db, presidentA, { action: "createMcpKey", name: "Claude", scopes: ["club:read"] }, clubA)) as { key: string };
  const keyB = (await integrationsExecute(db, presidentB, { action: "createKey", name: "Site B", scopes: ["read:teams"] }, clubB)) as { key: string };
  for (const [org, by] of [
    [clubA, presidentA.userId],
    [clubB, presidentB.userId],
  ])
    await db.query("INSERT INTO webhook(organization_id,url,secret_sealed,events,created_by) VALUES($1,'https://hooks.example/a','sealed','{match.validated}',$2)", [org, by]);
  expect((await apiAuth(db, `Bearer ${keyA.key}`, "read:teams")).organization).toBe(clubA);
  expect((await orgMcpAuth(db, `Bearer ${mcpA.key}`)).organization).toBe(clubA);
  expect(await emitWebhook(db, clubA, "match.validated", "m1", {})).toBe(1);
  // The president's membership ends (no handover): her key, her Claude and her hook stop at once.
  await db.query("UPDATE organization_membership SET active=false WHERE organization_id=$1 AND user_id=$2", [clubA, presidentA.userId]);
  await expect(apiAuth(db, `Bearer ${keyA.key}`, "read:teams")).rejects.toMatchObject({ status: 403, code: "KEY_ORPHANED" });
  await expect(orgMcpAuth(db, `Bearer ${mcpA.key}`)).rejects.toMatchObject({ status: 403 });
  expect(await emitWebhook(db, clubA, "match.validated", "m2", {})).toBe(0);
  // Club B is not concerned.
  expect((await apiAuth(db, `Bearer ${keyB.key}`, "read:teams")).organization).toBe(clubB);
  expect(await emitWebhook(db, clubB, "match.validated", "m1", {})).toBe(1);
  // Back in office, then a real handover: the outgoing president's keys are revoked, her hook switched off.
  await db.query("UPDATE organization_membership SET active=true WHERE organization_id=$1 AND user_id=$2", [clubA, presidentA.userId]);
  expect((await apiAuth(db, `Bearer ${keyA.key}`, "read:teams")).organization).toBe(clubA);
  const next = await user("Nouvelle présidente", "next.president@example.test");
  const token = await invitation(clubA, presidentA.userId, "next.president@example.test", "club_president", { succession: true });
  await execute(db, next, { action: "accept", token });
  await expect(apiAuth(db, `Bearer ${keyA.key}`, "read:teams")).rejects.toMatchObject({ status: 401 });
  expect((await db.query("SELECT count(*)::int AS n FROM api_key WHERE organization_id=$1 AND revoked_at IS NULL", [clubA])).rows[0].n).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM organization_mcp_key WHERE organization_id=$1 AND revoked_at IS NULL", [clubA])).rows[0].n).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM webhook WHERE organization_id=$1 AND active", [clubA])).rows[0].n).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM api_key WHERE organization_id=$1 AND revoked_at IS NULL", [clubB])).rows[0].n).toBe(1);
});

it("lets only the competences that use it read the federation's registry", async () => {
  const communication = await actor(fed, "federation_worker", "Communication", ["federation.communication"]);
  const finance = await actor(fed, "federation_worker", "Trésorerie", ["federation.finance"]);
  const classifier = await actor(fed, "federation_worker", "Classification", ["federation.classification"]);
  const president = await actor(fed, "federation_president", "Présidente fédérale");
  for (const p of [communication, finance]) await expect(registryView(db, p)).rejects.toMatchObject({ code: "FORBIDDEN" });
  for (const p of [classifier, president]) expect(Array.isArray((await registryView(db, p)).players)).toBe(true);
});
