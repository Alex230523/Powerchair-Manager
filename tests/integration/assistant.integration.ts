import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { billingExecute } from "../../src/domains/billing/service";
import { assistantTurn, assistantView, type CallModel, type ModelReply } from "../../src/domains/assistant/service";

/**
 * Console, step 7 (06/11/2026): the assistant with a scripted model. Read
 * tools run at once and feed the model; a write stops the turn as a
 * pending action; approved, it runs and is journaled; refused, the model
 * is told; a read-only operator never gets a write tool; the tokens are
 * counted per day.
 */
const schema = "asst_" + randomUUID().replaceAll("-", ""),
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
/** A model that follows a script of replies and records what it was given. */
function scripted(replies: ModelReply[]) {
  const seen: Parameters<CallModel>[0][] = [];
  const call: CallModel = async (body) => {
    seen.push({ ...body, messages: [...body.messages] });
    const r = replies.shift();
    if (!r) throw new Error("script exhausted");
    return r;
  };
  return { call, seen };
}
const say = (text: string): ModelReply => ({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } });
const use = (id: string, name: string, input: Record<string, unknown>, text?: string): ModelReply => ({
  content: [...(text ? [{ type: "text" as const, text }] : []), { type: "tool_use", id, name, input }],
  stop_reason: "tool_use",
  usage: { input_tokens: 20, output_tokens: 8 },
});

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  const president = await user("Président A");
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [clubA, president.userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [clubA, president.userId])).rows[0].id;
  await execute(db, president, { action: "context", mandateId });
  owner = await operator("Alex", "owner");
  reader = await operator("Rita", "readonly");
  const plan = (await billingExecute(db, owner, { action: "plan", id: null, code: "club-an", name: "Club, annuel", amountCents: 24000, period: "year", basis: "organization", active: true })).id!;
  const sub = (await billingExecute(db, owner, { action: "subscribe", organizationId: clubA, planId: plan, startedOn: "2026-09-01", note: "" })).id!;
  invoice = (await billingExecute(db, owner, { action: "invoice", subscriptionId: sub, periodFrom: "2026-09-01", periodTo: "2027-08-31", dueDays: 0 })).id!;
  await billingExecute(db, owner, { action: "send", id: invoice });
  await db.query("UPDATE billing_invoice SET issued_on=CURRENT_DATE-20,due_on=CURRENT_DATE-12 WHERE id=$1", [invoice]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("runs the reads for the model, stops on a write, runs it once approved, and counts the tokens", async () => {
  const view = await assistantView(db, owner);
  expect(view.tools.map((x) => [x.name, x.readOnly])).toContainEqual(["send_reminder", false]);
  expect(view.today).toEqual({ calls: 0, input_tokens: 0, output_tokens: 0 });
  // Turn 1: the model reads the late invoices, then proposes a reminder.
  const m = scripted([use("t1", "invoices", { late: true }), use("t2", "send_reminder", { invoiceId: invoice }, "Une facture est en retard de 12 jours : j'envoie le premier rappel ?")]);
  const turn = await assistantTurn(db, owner, { locale: "fr", messages: [{ role: "user", content: "Quelles factures sont en retard ?" }] }, m.call);
  expect(m.seen).toHaveLength(2);
  expect(m.seen[0].tools.map((x) => (x as { name: string }).name)).toContain("send_reminder");
  expect(m.seen[0].system).toContain("Alex");
  expect(m.seen[0].system).toContain("French");
  // The read's result went back to the model: the invoice, late.
  const fed = m.seen[1].messages[2];
  expect(fed.role).toBe("user");
  expect(JSON.stringify(fed.content)).toContain(invoice);
  const first = (fed.content as { content: string }[])[0];
  expect(JSON.parse(first.content).invoices[0].late).toBe(true);
  expect(turn.pending).toMatchObject({ toolUseId: "t2", name: "send_reminder", input: { invoiceId: invoice } });
  expect(turn.usage).toEqual({ input: 40, output: 16, today: 56 });
  expect((await db.query("SELECT reminders FROM billing_invoice WHERE id=$1", [invoice])).rows[0].reminders).toBe(0);
  // Refused: the model is told, nothing ran.
  const m2 = scripted([say("D'accord, je ne fais rien.")]);
  const refused = await assistantTurn(db, owner, { locale: "fr", messages: turn.messages, decision: { toolUseId: "t2", approve: false } }, m2.call);
  expect(JSON.stringify(m2.seen[0].messages.at(-1)?.content)).toContain("refused");
  expect(refused.pending).toBeNull();
  expect((await db.query("SELECT reminders FROM billing_invoice WHERE id=$1", [invoice])).rows[0].reminders).toBe(0);
  // Approved: the reminder goes, journaled as the assistant's.
  const m3 = scripted([say("Rappel envoyé.")]);
  const approved = await assistantTurn(db, owner, { locale: "fr", messages: turn.messages, decision: { toolUseId: "t2", approve: true } }, m3.call);
  expect(approved.pending).toBeNull();
  expect(JSON.stringify(m3.seen[0].messages.at(-1)?.content)).toContain('level');
  expect((await db.query("SELECT reminders FROM billing_invoice WHERE id=$1", [invoice])).rows[0].reminders).toBe(1);
  expect((await db.query("SELECT kind FROM platform_action WHERE kind LIKE 'assistant.%'")).rows).toEqual([{ kind: "assistant.send_reminder" }]);
  expect((await assistantView(db, owner)).today).toEqual({ calls: 3, input_tokens: 60, output_tokens: 26 });
  // A decision that matches nothing, or a turn without a question, are refused.
  await expect(assistantTurn(db, owner, { locale: "fr", messages: turn.messages, decision: { toolUseId: "nope", approve: true } }, m3.call)).rejects.toMatchObject({ code: "ASSISTANT_PENDING" });
  await expect(assistantTurn(db, owner, { locale: "fr", messages: [] }, m3.call)).rejects.toMatchObject({ code: "ASSISTANT_TURN" });
});

it("gives a read-only operator no write tool, and answers an unknown or failing tool without stopping", async () => {
  expect((await assistantView(db, reader)).tools.every((x) => x.readOnly)).toBe(true);
  const m = scripted([use("r1", "send_reminder", { invoiceId: invoice }), use("r2", "organization", { id: "pas-un-uuid" }), say("Je ne peux pas.")]);
  const turn = await assistantTurn(db, reader, { locale: "en", messages: [{ role: "user", content: "Send a reminder" }] }, m.call);
  expect(turn.pending).toBeNull();
  expect(m.seen[0].tools.map((x) => (x as { name: string }).name)).not.toContain("send_reminder");
  expect(JSON.stringify(m.seen[1].messages.at(-1)?.content)).toContain("Unknown tool");
  expect(JSON.stringify(m.seen[2].messages.at(-1)?.content)).toContain("INVALID_INPUT");
  expect((await db.query("SELECT reminders FROM billing_invoice WHERE id=$1", [invoice])).rows[0].reminders).toBe(1);
});
