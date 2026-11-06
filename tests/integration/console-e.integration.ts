import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { integrationCommand, integrationsExecute, integrationsView } from "../../src/domains/integrations/public";
import { OrgMcpAuthError, orgMcpAuth, orgMcpHandle, orgTools } from "../../src/domains/mcp/organization";
import { consoleCountries, consoleCountryExecute, consoleOrganization } from "../../src/domains/console/service";
import { billingExecute, billingView } from "../../src/domains/billing/service";

/**
 * Console, series E (06/11/2026): a club's own MCP connector (keys of the
 * presidency, read only, scoped, dead with the mandate or the suspension)
 * and the console's countries (what lives in each, the owner's additions,
 * the billing filtered by country).
 */
const schema = "consolee_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, presidentB: Principal, coachA: Principal, owner: Principal, support: Principal, key: string, keyId: string, mandateA: string;

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
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, p.userId, role])).rows[0].id as string;
  await execute(db, p, { action: "context", mandateId });
  return { ...p, mandateId };
}
async function operator(name: string, role: string) {
  const p = await user(name);
  await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,$2)", [p.userId, role]);
  return p;
}
const call = (auth: Awaited<ReturnType<typeof orgMcpAuth>>, name: string, args: Record<string, unknown> = {}) => orgMcpHandle(db, auth, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
const result = (r: Awaited<ReturnType<typeof orgMcpHandle>>) => (r?.result as { structuredContent?: unknown; isError?: boolean; content: { text: string }[] }) ?? { content: [] };

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind,country_code) VALUES('Club A','club','BE') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,country_code) VALUES('Club B','club','NL') RETURNING id")).rows[0].id;
  const a = await actor(clubA, "club_president", "Président A");
  presidentA = a;
  mandateA = a.mandateId;
  presidentB = await actor(clubB, "club_president", "Présidente B");
  coachA = await actor(clubA, "coach", "Coach A");
  owner = await operator("Alex", "owner");
  support = await operator("Sam Support", "support");
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-2027',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id as string;
  const team = (await db.query("INSERT INTO team(organization_id,season_id,name,category) VALUES($1,$2,'Équipe 1','senior') RETURNING id", [clubA, season])).rows[0].id as string;
  await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,created_by) VALUES($1,$2,'Club B','league',now()+interval '7 days',$3)", [clubA, team, presidentA.userId]);
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id as string;
  const profile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles,status) VALUES($1,$2,'Dan Leroy','1999-05-05','{player}','active') RETURNING id", [clubA, person])).rows[0].id as string;
  const plan = (await db.query("INSERT INTO dues_plan(organization_id,season_id,category,amount_cents,max_installments,first_due) VALUES($1,$2,'Senior',15000,1,CURRENT_DATE+30) RETURNING id", [clubA, season])).rows[0].id as string;
  await db.query("INSERT INTO dues_receivable(organization_id,profile_id,season_id,plan_id,category,plan_snapshot,gross_cents,discount_cents,created_by) VALUES($1,$2,$3,$4,'Senior','{}',15000,0,$5)", [clubA, profile, season, plan, presidentA.userId]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("lets the presidency create a connector key (shown once, ten at most), not a coach, and lists it on the integrations page", async () => {
  await expect(integrationsExecute(db, coachA, integrationCommand.parse({ action: "createMcpKey", name: "Mon Claude", scopes: ["club:read"] }), clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const r = (await integrationsExecute(db, presidentA, integrationCommand.parse({ action: "createMcpKey", name: "Mon Claude", scopes: ["club:read", "calendar:read", "dues:read"] }), clubA)) as { id: string; key: string };
  expect(r.key).toMatch(/^pfmorg_[a-z0-9]{8}_[A-Za-z0-9_-]{40,50}$/);
  key = r.key;
  keyId = r.id;
  const v = await integrationsView(db, presidentA);
  expect(v.mcpEndpoint).toBe("/api/mcp/org");
  expect(v.mcpKeys.map((k) => [k.name, k.scopes, k.created_by_name, k.revoked_at])).toEqual([["Mon Claude", ["club:read", "calendar:read", "dues:read"], "Président A", null]]);
  expect((await integrationsView(db, presidentB)).mcpKeys).toEqual([]);
  expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE organization_id=$1 AND action='mcp.key.created'", [clubA])).rows[0].n).toBe(1);
  expect((await consoleOrganization(db, owner, clubA)).organization.mcp_keys).toBe(1);
});

it("serves the club, read only, by the key's scopes; the dues by name only with dues:read", async () => {
  await expect(orgMcpAuth(db, "Bearer pfmorg_00000000_" + "x".repeat(43))).rejects.toMatchObject({ status: 401 });
  await expect(orgMcpAuth(db, null)).rejects.toBeInstanceOf(OrgMcpAuthError);
  const auth = await orgMcpAuth(db, `Bearer ${key}`);
  expect(auth.organization).toBe(clubA);
  const init = await orgMcpHandle(db, auth, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  expect((init?.result as { serverInfo: { name: string } }).serverInfo.name).toBe("powerchair-football-manager-club");
  const list = await orgMcpHandle(db, auth, { jsonrpc: "2.0", id: 2, method: "tools/list" });
  expect((list?.result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] }).tools.map((t) => t.name)).toEqual(orgTools.map((t) => t.name));
  expect((list?.result as { tools: { annotations: { readOnlyHint: boolean } }[] }).tools.every((t) => t.annotations.readOnlyHint)).toBe(true);
  const overview = result(await call(auth, "club_overview")).structuredContent as { name: string; country: string; teams: number; players: number; upcoming_matches: number; dues_total_cents: number; next_matches: unknown[] };
  expect(overview).toMatchObject({ name: "Club A", country: "BE", teams: 1, players: 1, upcoming_matches: 1, dues_total_cents: 15000 });
  expect(overview.next_matches).toHaveLength(1);
  expect((result(await call(auth, "teams")).structuredContent as { teams: { name: string }[] }).teams.map((t) => t.name)).toEqual(["Équipe 1"]);
  expect((result(await call(auth, "matches")).structuredContent as { matches: unknown[] }).matches).toHaveLength(1);
  expect((result(await call(auth, "matches", { from: "2030-01-01" })).structuredContent as { matches: unknown[] }).matches).toHaveLength(0);
  const dues = result(await call(auth, "dues", { unpaidOnly: true })).structuredContent as { season: string; members: { name: string; remaining_cents: number }[]; total_cents: number };
  expect(dues.season).toBe("2026-2027");
  expect(dues.members).toEqual([{ name: "Dan Leroy", category: "Senior", amount_cents: 15000, paid_cents: 0, next_due_on: null, remaining_cents: 15000 }]);
  expect(result(await call(auth, "calendar")).structuredContent).toEqual({ events: [] });
  // A key without dues:read never sees a name; an unknown tool is refused; notifications are silent.
  const narrow = (await integrationsExecute(db, presidentA, integrationCommand.parse({ action: "createMcpKey", name: "Lecture du club", scopes: ["club:read"] }), clubA)) as { id: string; key: string };
  const narrowAuth = await orgMcpAuth(db, `Bearer ${narrow.key}`);
  expect(result(await call(narrowAuth, "dues")).isError).toBe(true);
  expect((await orgMcpHandle(db, narrowAuth, { jsonrpc: "2.0", id: 3, method: "tools/list" }))?.result).toMatchObject({ tools: expect.arrayContaining([expect.objectContaining({ name: "teams" })]) });
  expect((await orgMcpHandle(db, auth, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope" } }))?.error?.code).toBe(-32602);
  expect(await orgMcpHandle(db, auth, { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
  expect((await db.query("SELECT calls FROM organization_mcp_key WHERE id=$1", [keyId])).rows[0].calls).toBe(1);
});

it("dies with the mandate, the suspension or the revocation", async () => {
  await db.query("UPDATE organization SET suspended_at=now() WHERE id=$1", [clubA]);
  await expect(orgMcpAuth(db, `Bearer ${key}`)).rejects.toMatchObject({ status: 403, code: "ORG_SUSPENDED" });
  await db.query("UPDATE organization SET suspended_at=NULL WHERE id=$1", [clubA]);
  await db.query("UPDATE role_assignment SET valid_from=now()-interval '2 minutes',valid_until=now()-interval '1 minute' WHERE id=$1", [mandateA]);
  await expect(orgMcpAuth(db, `Bearer ${key}`)).rejects.toMatchObject({ status: 403, code: "KEY_ORPHANED" });
  await db.query("UPDATE role_assignment SET valid_until=NULL WHERE id=$1", [mandateA]);
  expect((await orgMcpAuth(db, `Bearer ${key}`)).keyId).toBe(keyId);
  await expect(integrationsExecute(db, presidentB, integrationCommand.parse({ action: "revokeMcpKey", id: keyId }), clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await integrationsExecute(db, presidentA, integrationCommand.parse({ action: "revokeMcpKey", id: keyId }), clubA);
  await expect(orgMcpAuth(db, `Bearer ${key}`)).rejects.toMatchObject({ status: 401 });
  expect((await integrationsView(db, presidentA)).mcpKeys.find((k) => k.id === keyId)?.revoked_at).not.toBeNull();
  expect((await consoleOrganization(db, owner, clubA)).organization.mcp_keys).toBe(1);
});

it("shows the countries with what lives in each, lets the owner add or rename one, filters the billing by country", async () => {
  const plan = (await billingExecute(db, owner, { action: "plan", id: null, code: "club-an", name: "Club, annuel", amountCents: 24000, period: "year", basis: "organization", active: true })).id!;
  const subB = (await billingExecute(db, owner, { action: "subscribe", organizationId: clubB, planId: plan, startedOn: "2026-11-01", note: "" })).id!;
  const inv = (await billingExecute(db, owner, { action: "invoice", subscriptionId: subB, periodFrom: "2026-11-01", periodTo: "2027-10-31", dueDays: 30 })).id!;
  await db.query("UPDATE billing_invoice SET state='sent',sent_at=now(),issued_on=CURRENT_DATE-31,due_on=CURRENT_DATE-1 WHERE id=$1", [inv]);
  const v = await consoleCountries(db, support);
  expect(v.canEdit).toBe(false);
  const be = v.countries.find((c) => c.code === "BE")!,
    nl = v.countries.find((c) => c.code === "NL")!;
  expect(be).toMatchObject({ clubs: 1, players: 1, mrr: 0, open: 0, late: 0, transfers_in: 0, transfers_out: 0, currency: "EUR" });
  expect(nl).toMatchObject({ clubs: 1, players: 0, mrr: 2000, open: 24000, late: 24000 });
  expect(be.last_activity).not.toBeNull();
  expect(v.countries[0].code).toBe("BE");
  // The owner adds Norway, then renames it; support may not.
  await expect(consoleCountryExecute(db, support, { code: "NO", name_fr: "Norvège", name_nl: "Noorwegen", name_en: "Norway", currency: "NOK", sort: 14 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await consoleCountryExecute(db, owner, { code: "NO", name_fr: "Norvège", name_nl: "Noorwegen", name_en: "Norway", currency: "NOK", sort: 14 })).toEqual({ ok: true, created: true });
  expect(await consoleCountryExecute(db, owner, { code: "NO", name_fr: "Norvège", name_nl: "Noorwegen", name_en: "Norway (Kingdom)", currency: "NOK", sort: 14 })).toEqual({ ok: true, created: false });
  const after = (await consoleCountries(db, owner)).countries.find((c) => c.code === "NO")!;
  expect(after).toMatchObject({ name_en: "Norway (Kingdom)", clubs: 0, currency: "NOK" });
  expect((await db.query("SELECT kind FROM platform_action WHERE kind LIKE 'country.%' ORDER BY created_at")).rows.map((r) => r.kind)).toEqual(["country.add", "country.edit"]);
  // The billing by country.
  expect((await billingView(db, owner, { country: "NL" })).invoices.map((i) => i.organization)).toEqual(["Club B"]);
  expect((await billingView(db, owner, { country: "BE" })).invoices).toEqual([]);
  expect((await billingView(db, owner, { country: "xx" })).invoices).toHaveLength(1);
  expect((await billingView(db, owner)).subscriptions[0].country).toBe("NL");
});
