import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { billingExecute } from "../../src/domains/billing/service";
import { mcpAuth, mcpHandle, mcpKeys, mcpKeysExecute, RATE_PER_MINUTE } from "../../src/domains/mcp/service";

/**
 * Console, step 6 (06/11/2026): the MCP server. A key of an operator with
 * scopes opens it; the tools see what the operator sees; a write is
 * journaled; a revoked key, a wrong key or a missing scope stop; 60 calls
 * a minute.
 */
const schema = "mcp_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, owner: Principal, reader: Principal, invoice: string;

async function user(name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, `${userId}@example.test`]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  return { userId, sessionId };
}
async function operator(name: string, role: string) {
  const p = await user(name);
  await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,$2)", [p.userId, role]);
  return p;
}
const call = (auth: Awaited<ReturnType<typeof mcpAuth>>, name: string, args: Record<string, unknown> = {}, id = 1) => mcpHandle(db, auth, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const result = (r: Awaited<ReturnType<typeof mcpHandle>>) => (r?.result ?? null) as { isError?: boolean; content: { type: string; text: string }[]; structuredContent?: Record<string, unknown> } | null;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  const president = await user("Président A");
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [clubA, president.userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [clubA, president.userId])).rows[0].id;
  await execute(db, president, { action: "context", mandateId });
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles,status,phone) VALUES($1,$2,'Mina Petit','2012-03-03','{player}','active','0470 11 22 33')", [clubA, person]);
  owner = await operator("Alex", "owner");
  reader = await operator("Rita", "readonly");
  const plan = (await billingExecute(db, owner, { action: "plan", id: null, code: "club-an", name: "Club, annuel", amountCents: 24000, period: "year", basis: "organization", active: true })).id!;
  const sub = (await billingExecute(db, owner, { action: "subscribe", organizationId: clubA, planId: plan, startedOn: "2026-09-01", note: "" })).id!;
  invoice = (await billingExecute(db, owner, { action: "invoice", subscriptionId: sub, periodFrom: "2026-09-01", periodTo: "2027-08-31", dueDays: 0 })).id!;
  await billingExecute(db, owner, { action: "send", id: invoice });
  await db.query("UPDATE billing_invoice SET issued_on=CURRENT_DATE-10,due_on=CURRENT_DATE-5 WHERE id=$1", [invoice]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("gives an operator keys within their role, shows the secret once, revokes", async () => {
  expect((await mcpKeys(db, reader)).scopes).toEqual(["console:read", "billing:read"]);
  expect((await mcpKeys(db, owner)).scopes).toEqual(["console:read", "billing:read", "billing:write", "support:write"]);
  await expect(mcpKeysExecute(db, reader, { action: "createKey", name: "Trop", scopes: ["billing:write"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  const made = await mcpKeysExecute(db, owner, { action: "createKey", name: "Claude portable", scopes: ["console:read", "billing:read", "billing:write"] });
  expect(made.key).toMatch(/^pfmop_[a-z0-9]{8}_[A-Za-z0-9_-]{40,50}$/);
  const listed = (await mcpKeys(db, owner)).keys;
  expect(listed.map((k) => [k.name, k.scopes, k.calls, k.revoked_at])).toEqual([["Claude portable", ["console:read", "billing:read", "billing:write"], 0, null]]);
  expect(JSON.stringify(listed)).not.toContain(made.key!.slice(15));
  // Another operator cannot revoke it.
  await expect(mcpKeysExecute(db, reader, { action: "revokeKey", id: made.id! })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("answers the protocol, offers the tools of the key's scopes, journals the writes, and stops a revoked key", async () => {
  const { key, id: keyId } = await mcpKeysExecute(db, owner, { action: "createKey", name: "Test", scopes: ["console:read", "billing:read", "billing:write"] });
  await expect(mcpAuth(db, "Bearer pfmop_00000000_" + "x".repeat(43))).rejects.toMatchObject({ status: 401 });
  await expect(mcpAuth(db, null)).rejects.toMatchObject({ status: 401 });
  const auth = await mcpAuth(db, `Bearer ${key}`);
  expect(auth.principal.userId).toBe(owner.userId);
  const init = await mcpHandle(db, auth, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } });
  expect(init?.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "powerchair-football-manager-console" } });
  expect(await mcpHandle(db, auth, { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
  expect((await mcpHandle(db, auth, { jsonrpc: "2.0", id: 2, method: "ping" }))?.result).toEqual({});
  expect((await mcpHandle(db, auth, { jsonrpc: "2.0", id: 3, method: "resources/list" }))?.error?.code).toBe(-32601);
  expect((await mcpHandle(db, auth, { nope: true }))?.error?.code).toBe(-32600);
  const list = (await mcpHandle(db, auth, { jsonrpc: "2.0", id: 4, method: "tools/list" }))?.result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] };
  expect(list.tools.map((t) => t.name)).toEqual(["platform_overview", "list_organizations", "organization", "supervision", "billing_overview", "invoices", "send_reminder", "mark_invoice_paid"]);
  expect(list.tools.find((t) => t.name === "send_reminder")?.annotations.readOnlyHint).toBe(false);
  // Reads: counts and states, no personal data.
  const overview = result(await call(auth, "platform_overview"));
  expect(overview?.structuredContent).toMatchObject({ organizations: { clubs: 1 }, people: { players: 1 } });
  expect(overview?.content[0].text).not.toContain("Mina");
  const orgs = result(await call(auth, "list_organizations", { q: "club" }));
  expect((orgs?.structuredContent as { organizations: { name: string }[] }).organizations.map((o) => o.name)).toEqual(["Club A"]);
  const late = result(await call(auth, "invoices", { late: true }));
  expect((late?.structuredContent as { invoices: { id: string; late: boolean }[] }).invoices).toMatchObject([{ id: invoice, late: true }]);
  expect(result(await call(auth, "organization", { id: "not-a-uuid" }))?.content[0].text).toBe("INVALID_INPUT");
  expect(result(await call(auth, "organization", { id: randomUUID() }))?.content[0].text).toBe("NOT_FOUND");
  expect((await call(auth, "no_such_tool"))?.error?.code).toBe(-32602);
  // A write: done as the operator, journaled with the key.
  const reminded = result(await call(auth, "send_reminder", { invoiceId: invoice }));
  expect(reminded?.structuredContent).toMatchObject({ ok: true, level: 1 });
  expect((await db.query("SELECT kind,payload->>'keyId' AS key FROM platform_action WHERE kind LIKE 'mcp.send%'")).rows).toEqual([{ kind: "mcp.send_reminder", key: keyId }]);
  expect((await db.query("SELECT reminders FROM billing_invoice WHERE id=$1", [invoice])).rows[0].reminders).toBe(1);
  // A scope the key lacks.
  const note = result(await call(auth, "add_note", { organizationId: clubA, text: "x" }));
  expect(note?.isError).toBe(true);
  expect(note?.content[0].text).toContain("support:write");
  expect((await db.query("SELECT calls FROM operator_api_key WHERE id=$1", [keyId])).rows[0].calls).toBe(1);
  // A key of a read-only operator cannot write even with the tool present? It never gets the scope.
  const { key: readKey } = await mcpKeysExecute(db, reader, { action: "createKey", name: "Lecture", scopes: ["console:read"] });
  const readAuth = await mcpAuth(db, `Bearer ${readKey}`);
  const readList = (await mcpHandle(db, readAuth, { jsonrpc: "2.0", id: 5, method: "tools/list" }))?.result as { tools: { name: string }[] };
  expect(readList.tools.map((t) => t.name)).toEqual(["platform_overview", "list_organizations", "organization", "supervision"]);
  // Revoked: stops at once.
  await mcpKeysExecute(db, owner, { action: "revokeKey", id: keyId! });
  await expect(mcpAuth(db, `Bearer ${key}`)).rejects.toMatchObject({ status: 401 });
  // Rate: 60 a minute.
  await db.query("UPDATE operator_api_rate SET count=$2 WHERE key_id=$1", [readAuth.keyId, RATE_PER_MINUTE]);
  await expect(mcpAuth(db, `Bearer ${readKey}`)).rejects.toMatchObject({ status: 429 });
});
