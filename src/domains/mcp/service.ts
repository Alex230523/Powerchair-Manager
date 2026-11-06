import type { Pool } from "pg";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AccessError, type Principal } from "../access/service";
import { canBill, canWrite, consoleExecute, consoleHome, consoleOrganization, consoleOrganizations, consoleSupervision, operatorScope, type Operator } from "../console/service";
import { billingCommand, billingExecute, billingView } from "../billing/service";
import { consoleCommand, keyReview } from "../console/schema";
import { consoleSupport, consoleTicket, supportOperatorExecute } from "../support/service";
import { supportOperatorCommand } from "../support/schema";
import { PROTOCOL_VERSION, mcpScopes, rpcRequest, serverInfo, tools, type McpKeyCommand, type McpScope, type RpcRequest } from "./schema";
export { mcpKeyCommand } from "./schema";

/**
 * Console, step 6 (06/11/2026): the MCP server of the console (Streamable
 * HTTP, stateless, JSON responses). A key « pfmop_<prefix>_<secret> » of
 * an operator, with scopes, opens it; the tools call the console's own
 * services as that operator, so they see what the operator sees and
 * nothing more; every write lands in platform_action like the console's.
 */
export const RATE_PER_MINUTE = 60;
export class McpAuthError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
const keyHash = (key: string) => createHash("sha256").update(key).digest("hex");

export type KeyRow = { id: string; name: string; prefix: string; scopes: McpScope[]; calls: number; created_at: string; last_used_at: string | null; revoked_at: string | null };
export async function mcpKeys(db: Pool, p: Principal) {
  return operatorScope(db, p, async (c, o) => {
    const keys = (await c.query("SELECT id,name,prefix,scopes,calls,created_at,last_used_at,revoked_at FROM operator_api_key WHERE operator_id=$1 ORDER BY revoked_at NULLS FIRST,created_at DESC", [o.userId])).rows as KeyRow[];
    // Series D: a key never used, idle for 60 days or older than 180 days is flagged for review.
    return { keys: keys.map((k) => ({ ...k, review: k.revoked_at ? null : keyReview(k) })), scopes: allowedScopes(o), endpoint: "/api/mcp" };
  });
}
/** The scopes an operator may give a key: never more than their own role. */
export function allowedScopes(o: Operator): McpScope[] {
  return mcpScopes.filter((s) => (s === "billing:write" ? canBill(o) : s === "support:write" ? canWrite(o) : true));
}
export async function mcpKeysExecute(db: Pool, p: Principal, command: McpKeyCommand) {
  return operatorScope(db, p, async (c, o) => {
    if (command.action === "createKey") {
      const allowed = allowedScopes(o);
      if (command.scopes.some((s) => !allowed.includes(s))) throw new AccessError("FORBIDDEN");
      const prefix = randomBytes(8).toString("hex").slice(0, 8);
      const key = `pfmop_${prefix}_${randomBytes(32).toString("base64url")}`;
      const id = (await c.query("INSERT INTO operator_api_key(operator_id,name,prefix,key_hash,scopes) VALUES($1,$2,$3,$4,$5) RETURNING id", [o.userId, command.name, prefix, keyHash(key), [...new Set(command.scopes)]])).rows[0].id as string;
      await c.query("INSERT INTO platform_action(operator_id,kind,payload) VALUES($1,'mcp.key.create',$2)", [o.userId, JSON.stringify({ id, scopes: command.scopes })]);
      // The secret is shown once; only its hash stays.
      return { ok: true as const, id, key };
    }
    // Series D: the owner revokes anyone's key (the review of the keys); the others their own.
    const r = await c.query(`UPDATE operator_api_key SET revoked_at=now() WHERE id=$1 AND ${o.role === "owner" ? "true" : "operator_id=$2"} AND revoked_at IS NULL RETURNING id,operator_id`, o.role === "owner" ? [command.id] : [command.id, o.userId]);
    if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
    await c.query("INSERT INTO platform_action(operator_id,kind,payload) VALUES($1,'mcp.key.revoke',$2)", [o.userId, JSON.stringify({ id: command.id, owner: r.rows[0].operator_id })]);
    return { ok: true as const };
  });
}

/** The operator behind a bearer key, with the key's scopes; 60 calls a minute. */
export async function mcpAuth(db: Pool, header: string | null) {
  const m = /^Bearer (pfmop_([a-z0-9]{8})_[A-Za-z0-9_-]{40,50})$/.exec(header ?? "");
  if (!m) throw new McpAuthError(401, "API_KEY_INVALID");
  const k = (await db.query("SELECT k.id,k.operator_id,k.key_hash,k.scopes,k.revoked_at,o.revoked_at AS operator_revoked FROM operator_api_key k LEFT JOIN platform_operator o ON o.user_id=k.operator_id WHERE k.prefix=$1", [m[2]])).rows[0] as
    | { id: string; operator_id: string; key_hash: string; scopes: McpScope[]; revoked_at: string | null; operator_revoked: string | null }
    | undefined;
  const given = Buffer.from(keyHash(m[1])),
    stored = Buffer.from(k?.key_hash ?? "".padEnd(64, "0"));
  if (!k || k.revoked_at || given.length !== stored.length || !timingSafeEqual(given, stored)) throw new McpAuthError(401, "API_KEY_INVALID");
  const count = (
    await db.query(
      "INSERT INTO operator_api_rate(key_id,window_start,count) VALUES($1,date_trunc('minute',now()),1) ON CONFLICT (key_id,window_start) DO UPDATE SET count=operator_api_rate.count+1 RETURNING count",
      [k.id],
    )
  ).rows[0].count as number;
  if (count > RATE_PER_MINUTE) throw new McpAuthError(429, "RATE_LIMITED");
  await db.query("UPDATE operator_api_key SET last_used_at=now(),calls=calls+1 WHERE id=$1", [k.id]);
  if (Math.random() < 0.02) await db.query("DELETE FROM operator_api_rate WHERE window_start<now()-interval '1 hour'");
  return { keyId: k.id, principal: { userId: k.operator_id, sessionId: `mcp:${k.id}` } as Principal, scopes: k.scopes };
}

/** One tool of the console, run as the operator; shared by the MCP server and the assistant (step 7). */
export async function runTool(db: Pool, p: Principal, name: string, a: Record<string, unknown>): Promise<unknown> {
  let out: unknown;
  switch (name) {
    case "platform_overview":
      out = await consoleHome(db, p);
      break;
    case "list_organizations":
      out = await consoleOrganizations(db, p, { q: arg(a, "q"), kind: arg(a, "kind"), country: arg(a, "country") });
      break;
    case "organization":
      out = await consoleOrganization(db, p, z.uuid().parse(arg(a, "id")));
      break;
    case "supervision":
      out = await consoleSupervision(db, p);
      break;
    case "billing_overview": {
      const v = await billingView(db, p);
      out = { figures: v.figures, plans: v.plans, subscriptions: v.subscriptions };
      break;
    }
    case "invoices": {
      const v = await billingView(db, p, { state: arg(a, "state"), organization: arg(a, "organization") });
      out = { invoices: a.late === true ? v.invoices.filter((i) => i.late) : v.invoices };
      break;
    }
    case "send_reminder":
      out = await billingExecute(db, p, billingCommand.parse({ action: "remind", id: arg(a, "invoiceId") }));
      break;
    case "mark_invoice_paid":
      out = await billingExecute(db, p, billingCommand.parse({ action: "paid", id: arg(a, "invoiceId"), paidOn: arg(a, "paidOn") }));
      break;
    case "add_note":
      out = await consoleExecute(db, p, consoleCommand.parse({ action: "note", organizationId: arg(a, "organizationId"), text: arg(a, "text") }));
      break;
    case "tickets": {
      const v = await consoleSupport(db, p, { state: arg(a, "state"), q: arg(a, "q") });
      out = { tickets: v.tickets, counts: v.counts, firstReplyHours: v.firstReplyHours, privacy: v.privacy };
      break;
    }
    case "ticket": {
      const v = await consoleTicket(db, p, z.uuid().parse(arg(a, "id")));
      out = { ticket: v.ticket, messages: v.messages };
      break;
    }
    case "reply_ticket":
      out = await supportOperatorExecute(db, p, supportOperatorCommand.parse({ action: "reply", id: arg(a, "id"), text: arg(a, "text"), close: a.close === true }));
      break;
    case "remind_privacy_request":
      out = await supportOperatorExecute(db, p, supportOperatorCommand.parse({ action: "privacyRemind", requestId: arg(a, "requestId") }));
      break;
  }
  return out;
}

type Rpc = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string; data?: unknown } };
const reply = (id: string | number | null, result: unknown): Rpc => ({ jsonrpc: "2.0", id, result });
const fail = (id: string | number | null, code: number, message: string, data?: unknown): Rpc => ({ jsonrpc: "2.0", id, error: { code, message, data } });
const text = (value: unknown) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 1) }], structuredContent: value as Record<string, unknown> });
const arg = (a: Record<string, unknown>, k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");

/** One JSON-RPC message of the MCP protocol; null for a notification (no answer). */
export async function mcpHandle(db: Pool, auth: { principal: Principal; scopes: McpScope[]; keyId: string }, raw: unknown): Promise<Rpc | null> {
  const parsed = rpcRequest.safeParse(raw);
  if (!parsed.success) return fail(null, -32600, "Invalid request");
  const req: RpcRequest = parsed.data;
  const id = req.id ?? null;
  if (req.method.startsWith("notifications/")) return null;
  if (req.method === "initialize") return reply(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo, instructions: "Console of Powerchair Football Manager. Read tools return counts and states, never a player's personal data. Write tools (reminder, payment, note) are journaled with the operator's name; confirm each with the person before calling." });
  if (req.method === "ping") return reply(id, {});
  if (req.method === "tools/list")
    return reply(id, {
      tools: tools.filter((t) => auth.scopes.includes(t.scope)).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: t.readOnly, destructiveHint: false, idempotentHint: t.readOnly, openWorldHint: false } })),
    });
  if (req.method !== "tools/call") return fail(id, -32601, "Method not found");
  const name = typeof req.params?.name === "string" ? req.params.name : "";
  const tool = tools.find((t) => t.name === name);
  if (!tool) return fail(id, -32602, "Unknown tool");
  if (!auth.scopes.includes(tool.scope)) return reply(id, { isError: true, content: [{ type: "text", text: `This key lacks the scope ${tool.scope}.` }] });
  const a = (req.params?.arguments && typeof req.params.arguments === "object" ? req.params.arguments : {}) as Record<string, unknown>;
  const p = auth.principal;
  try {
    const out = await runTool(db, p, tool.name, a);
    if (!tool.readOnly) await db.query("INSERT INTO platform_action(operator_id,kind,payload) VALUES($1,$2,$3)", [p.userId, `mcp.${tool.name}`, JSON.stringify({ keyId: auth.keyId, arguments: a })]);
    return reply(id, text(out));
  } catch (e) {
    const code = e instanceof AccessError ? e.code : e instanceof Error && e.name === "ZodError" ? "INVALID_INPUT" : "ERROR";
    return reply(id, { isError: true, content: [{ type: "text", text: code }] });
  }
}
