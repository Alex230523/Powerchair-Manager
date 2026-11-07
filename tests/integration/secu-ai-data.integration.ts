import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { supportExecute } from "../../src/domains/support/service";
import { assistantTurn, type CallModel, type ModelReply } from "../../src/domains/assistant/service";
import { mcpHandle, runTool } from "../../src/domains/mcp/service";
import { runOrgTool } from "../../src/domains/mcp/organization";

/**
 * Security (07/11/2026), data leaking to an AI, on the real database. A
 * parent of club A writes to support with her phone, her e-mail, her IBAN
 * and her child's national number; another one asks for her data to be
 * erased. Club B's president is an officer with an e-mail. What the
 * console's assistant sends to the model, what the operators' MCP and the
 * club's MCP return: none of those details, and not a word of the request
 * about personal data.
 */
const schema = "secaidata_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, parent: Principal, owner: Principal, ticket: string, erasure: string;
const details = ["0470 12 34 56", "dan.leroy@example.be", "BE68 5390 0754 7034", "12.03.12-345.67"];

async function user(name: string, email = `${randomUUID()}@example.test`) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, email]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  return { userId, sessionId };
}
async function member(org: string, role: string, name: string, email?: string) {
  const p = await user(name, email);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, p.userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, p.userId, role])).rows[0].id;
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const leaks = (text: string) => [...details, "eva.martin@example.be", "dan.parent@example.be"].filter((d) => text.includes(d));

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  parent = await member(clubA, "club_president", "Dan Parent", "dan.parent@example.be");
  await member(clubB, "club_president", "Eva Martin", "eva.martin@example.be");
  owner = await user("Alex");
  await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,'owner')", [owner.userId]);
  await supportExecute(db, parent, { action: "open", category: "question", subject: "Cotisation de ma fille", text: `Rappelez-moi au ${details[0]} ou à ${details[1]}. Remboursez sur ${details[2]}. Son numéro national : ${details[3]}.` });
  await supportExecute(db, parent, { action: "open", category: "data", subject: "Effacement de mes données", text: "Je demande l'effacement de toutes les données de ma fille Ana, suivie pour épilepsie." });
  ticket = (await db.query("SELECT id FROM support_ticket WHERE category='question'")).rows[0].id;
  erasure = (await db.query("SELECT id FROM support_ticket WHERE category='data'")).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("sends the model the ticket's question, never the ways to reach or identify the people", async () => {
  const seen: string[] = [];
  const replies: ModelReply[] = [
    { content: [{ type: "tool_use", id: "a", name: "ticket", input: { id: ticket } }, { type: "tool_use", id: "b", name: "ticket", input: { id: erasure } }, { type: "tool_use", id: "c", name: "tickets", input: {} }], stop_reason: "tool_use", usage: { input_tokens: 1, output_tokens: 1 } },
    { content: [{ type: "text", text: "Résumé." }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } },
  ];
  const call: CallModel = async (body) => {
    seen.push(JSON.stringify(body));
    return replies.shift()!;
  };
  await assistantTurn(db, owner, { locale: "fr", messages: [{ role: "user", content: "Résume les tickets." }] }, call);
  const sent = seen.join("\n");
  expect(sent).toContain("Cotisation de ma fille");
  expect(sent).toContain("[téléphone]");
  expect(leaks(sent)).toEqual([]);
  // The request about personal data: its subject, not its words.
  expect(sent).toContain("Effacement de mes données");
  expect(sent).not.toContain("épilepsie");
  expect(sent).toContain("a request about personal data");
});

it("returns no e-mail of an officer or a requester to an MCP client, operators' or club's", async () => {
  const orgB = JSON.stringify(await runTool(db, owner, "organization", { id: clubB }));
  expect(orgB).toContain("Eva Martin");
  expect(leaks(orgB)).toEqual([]);
  const auth = { principal: owner, scopes: ["console:read"] as never, keyId: randomUUID() };
  const listed = JSON.stringify(await mcpHandle(db, auth, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "tickets", arguments: {} } }));
  expect(listed).toContain("Dan Parent");
  expect(leaks(listed)).toEqual([]);
  const club = JSON.stringify(await runOrgTool(db, clubA, "club_overview", {}));
  expect(club).toContain("Club A");
  expect(leaks(club)).toEqual([]);
});
