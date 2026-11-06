import type { Pool, PoolClient } from "pg";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AccessError, audit } from "../access/service";
import { apiMatches, apiTeams, apiTournaments } from "../integrations/api";
import { PROTOCOL_VERSION, rpcRequest, type RpcRequest } from "./schema";

/**
 * Console, series E (06/11/2026), level 3 of the plan: a club's own MCP
 * connector. The presidency holds keys « pfmorg_<prefix>_<secret> » with
 * read-only scopes; a president plugs their own Claude on their club and
 * asks it about the teams, the calendar, the dues. The key acts for the
 * organisation only, never through the president's session, and stops the
 * day its holder is no longer president. Nothing is written through it.
 */
export { orgScopes, orgKeyCommand, RATE_PER_MINUTE, type OrgScope, type OrgKeyCommand } from "./organization-schema";
import { RATE_PER_MINUTE, orgKeyCommand, type OrgKeyCommand, type OrgScope } from "./organization-schema";
const keyHash = (key: string) => createHash("sha256").update(key).digest("hex");
export class OrgMcpAuthError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

const str = (description: string, max = 200) => ({ type: "string", description, maxLength: max });
export const orgTools: { name: string; description: string; scope: OrgScope; inputSchema: Record<string, unknown> }[] = [
  { name: "club_overview", description: "The club as a whole: name, country, seasons, teams, counts of players and staff, next matches, open dues (totals only).", scope: "club:read", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "teams", description: "The club's teams of the current seasons, with their season and category.", scope: "club:read", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "matches", description: "The club's matches between two dates (default: 90 days back to a year ahead), with results when played.", scope: "club:read", inputSchema: { type: "object", properties: { from: str("Start date YYYY-MM-DD", 10), to: str("End date YYYY-MM-DD", 10) }, additionalProperties: false } },
  { name: "tournaments", description: "The club's tournaments (name, year, teams).", scope: "club:read", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "calendar", description: "The club's calendar between two dates (default: today to 60 days ahead): trainings, meetings, friendlies, camps, with team and place. No participant names.", scope: "calendar:read", inputSchema: { type: "object", properties: { from: str("Start date YYYY-MM-DD", 10), to: str("End date YYYY-MM-DD", 10) }, additionalProperties: false } },
  { name: "dues", description: "The dues of a season, member by member (name, category, amount, paid, remaining, next instalment). Personal data of the club's members: use it for the club's own follow-up only.", scope: "dues:read", inputSchema: { type: "object", properties: { season: str("Season name; the current one by default", 80), unpaidOnly: { type: "boolean", description: "Only members with something left to pay" } }, additionalProperties: false } },
];

/* ------------------------------------------------------------ Keys (the presidency, from the integrations page) */
export type OrgKeyRow = { id: string; name: string; prefix: string; scopes: OrgScope[]; calls: number; created_at: string; last_used_at: string | null; revoked_at: string | null; created_by_name: string };
export async function orgMcpKeys(c: PoolClient, org: string) {
  return (await c.query('SELECT k.id,k.name,k.prefix,k.scopes,k.calls,k.created_at,k.last_used_at,k.revoked_at,u.name AS created_by_name FROM organization_mcp_key k JOIN "user" u ON u.id=k.created_by WHERE k.organization_id=$1 ORDER BY k.revoked_at IS NOT NULL,k.created_at DESC', [org])).rows as OrgKeyRow[];
}
export async function orgMcpKeyExecute(c: PoolClient, org: string, userId: string, cmd: OrgKeyCommand) {
  if (cmd.action === "createMcpKey") {
    if ((await c.query("SELECT count(*)::int AS n FROM organization_mcp_key WHERE organization_id=$1 AND revoked_at IS NULL", [org])).rows[0].n >= 10) throw new AccessError("TOO_MANY", 409);
    const prefix = randomBytes(8).toString("hex").slice(0, 8);
    const key = `pfmorg_${prefix}_${randomBytes(32).toString("base64url")}`;
    const id = (await c.query("INSERT INTO organization_mcp_key(organization_id,created_by,name,prefix,key_hash,scopes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [org, userId, cmd.name, prefix, keyHash(key), [...new Set(cmd.scopes)]])).rows[0].id as string;
    await audit(c, org, userId, "mcp.key.created", id, { scopes: cmd.scopes });
    // The secret is shown once; only its hash stays.
    return { id, key };
  }
  const r = await c.query("UPDATE organization_mcp_key SET revoked_at=now(),revoked_by=$3 WHERE id=$1 AND organization_id=$2 AND revoked_at IS NULL", [cmd.id, org, userId]);
  if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
  await audit(c, org, userId, "mcp.key.revoked", cmd.id);
  return { id: cmd.id };
}

/* ------------------------------------------------------------ The server */
/** The organisation behind a bearer key; the holder must still preside; 60 calls a minute. */
export async function orgMcpAuth(db: Pool, header: string | null) {
  const m = /^Bearer (pfmorg_([a-z0-9]{8})_[A-Za-z0-9_-]{40,50})$/.exec(header ?? "");
  if (!m) throw new OrgMcpAuthError(401, "API_KEY_INVALID");
  const k = (
    await db.query(
      `SELECT k.id,k.organization_id,k.key_hash,k.scopes,k.revoked_at,o.suspended_at,
         EXISTS(SELECT 1 FROM role_assignment r WHERE r.organization_id=k.organization_id AND r.user_id=k.created_by AND r.role='club_president' AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())) AS presides
         FROM organization_mcp_key k JOIN organization o ON o.id=k.organization_id WHERE k.prefix=$1`,
      [m[2]],
    )
  ).rows[0] as { id: string; organization_id: string; key_hash: string; scopes: OrgScope[]; revoked_at: string | null; suspended_at: string | null; presides: boolean } | undefined;
  const given = Buffer.from(keyHash(m[1])),
    stored = Buffer.from(k?.key_hash ?? "".padEnd(64, "0"));
  if (!k || k.revoked_at || given.length !== stored.length || !timingSafeEqual(given, stored)) throw new OrgMcpAuthError(401, "API_KEY_INVALID");
  if (!k.presides) throw new OrgMcpAuthError(403, "KEY_ORPHANED");
  if (k.suspended_at) throw new OrgMcpAuthError(403, "ORG_SUSPENDED");
  const count = (await db.query("INSERT INTO organization_mcp_rate(key_id,window_start,count) VALUES($1,date_trunc('minute',now()),1) ON CONFLICT (key_id,window_start) DO UPDATE SET count=organization_mcp_rate.count+1 RETURNING count", [k.id])).rows[0].count as number;
  if (count > RATE_PER_MINUTE) throw new OrgMcpAuthError(429, "RATE_LIMITED");
  await db.query("UPDATE organization_mcp_key SET last_used_at=now(),calls=calls+1 WHERE id=$1", [k.id]);
  if (Math.random() < 0.02) await db.query("DELETE FROM organization_mcp_rate WHERE window_start<now()-interval '1 hour'");
  return { keyId: k.id, organization: k.organization_id, scopes: k.scopes };
}

const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
/** One tool, read only, scoped to the organisation by the key. */
export async function runOrgTool(db: Pool, org: string, name: string, a: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "club_overview": {
      const o = (await db.query("SELECT o.name,o.country_code AS country,f.name AS federation FROM organization o LEFT JOIN organization f ON f.id=o.federation_id WHERE o.id=$1", [org])).rows[0];
      const seasons = (await db.query("SELECT name,starts_on::text AS starts_on,ends_on::text AS ends_on FROM season WHERE organization_id=$1 AND NOT archived ORDER BY starts_on DESC LIMIT 3", [org])).rows;
      const counts = (
        await db.query(
          `SELECT (SELECT count(*)::int FROM team t WHERE t.organization_id=$1 AND NOT t.archived) AS teams,
                  (SELECT count(*)::int FROM club_person cp WHERE cp.organization_id=$1 AND cp.status='active' AND 'player'=ANY(cp.directory_roles)) AS players,
                  (SELECT count(*)::int FROM club_person cp WHERE cp.organization_id=$1 AND cp.status='active' AND NOT ('player'=ANY(cp.directory_roles))) AS staff,
                  (SELECT count(*)::int FROM match m WHERE m.organization_id=$1 AND m.starts_at>now() AND m.status='scheduled') AS upcoming_matches,
                  (SELECT COALESCE(sum(d.net_cents),0)::int FROM dues_receivable d WHERE d.organization_id=$1 AND d.status='open') AS dues_total_cents,
                  (SELECT COALESCE(sum(t.amount_cents),0)::int FROM finance_transaction t JOIN dues_receivable d ON d.id=t.receivable_id WHERE d.organization_id=$1 AND d.status='open' AND t.cancelled_at IS NULL AND t.direction='in') AS dues_paid_cents`,
          [org],
        )
      ).rows[0];
      const next = (await db.query("SELECT m.starts_at,t.name AS team,m.opponent,m.home,m.kind,m.competition FROM match m JOIN team t ON t.id=m.team_id WHERE m.organization_id=$1 AND m.starts_at>now() AND m.status='scheduled' ORDER BY m.starts_at LIMIT 5", [org])).rows;
      return { ...o, seasons, ...counts, next_matches: next };
    }
    case "teams":
      return { teams: await apiTeams(db, org) };
    case "matches":
      return { matches: await apiMatches(db, org, day(a.from), day(a.to)) };
    case "tournaments":
      return { tournaments: await apiTournaments(db, org) };
    case "calendar": {
      const rows = (
        await db.query(
          `SELECT e.id,e.title,e.kind,e.custom_type,e.starts_at,e.ends_at,e.status,t.name AS team,p.name AS place FROM calendar_event e LEFT JOIN team t ON t.id=e.team_id LEFT JOIN calendar_place p ON p.id=e.place_id
             WHERE e.organization_id=$1 AND e.starts_at>=COALESCE($2::date,CURRENT_DATE) AND e.starts_at<COALESCE($3::date,CURRENT_DATE+60)+1 ORDER BY e.starts_at LIMIT 300`,
          [org, day(a.from), day(a.to)],
        )
      ).rows;
      return { events: rows };
    }
    case "dues": {
      const season = typeof a.season === "string" && a.season.trim() ? a.season.trim().slice(0, 80) : null;
      const s = (await db.query("SELECT id,name FROM season WHERE organization_id=$1 AND ($2::text IS NULL OR name=$2) AND NOT archived ORDER BY CASE WHEN CURRENT_DATE BETWEEN starts_on AND ends_on THEN 0 ELSE 1 END,starts_on DESC LIMIT 1", [org, season])).rows[0] as { id: string; name: string } | undefined;
      if (!s) return { season: null, members: [] };
      const rows = (
        await db.query(
          `SELECT cp.full_name AS name,d.category,d.net_cents AS amount_cents,
                  (SELECT COALESCE(sum(t.amount_cents),0)::int FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL AND t.direction='in') AS paid_cents,
                  (SELECT min(i.due_on)::text FROM dues_installment i WHERE i.receivable_id=d.id AND i.due_on>=CURRENT_DATE) AS next_due_on
             FROM dues_receivable d JOIN club_person cp ON cp.id=d.profile_id WHERE d.organization_id=$1 AND d.season_id=$2 AND d.status='open' ORDER BY cp.full_name LIMIT 1000`,
          [org, s.id],
        )
      ).rows as { name: string; category: string; amount_cents: number; paid_cents: number; next_due_on: string | null }[];
      const members = rows.map((r) => ({ ...r, remaining_cents: Math.max(0, r.amount_cents - r.paid_cents) })).filter((r) => a.unpaidOnly !== true || r.remaining_cents > 0);
      return { season: s.name, members, total_cents: rows.reduce((n, r) => n + r.amount_cents, 0), paid_cents: rows.reduce((n, r) => n + r.paid_cents, 0) };
    }
  }
  return null;
}

type Rpc = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };
const reply = (id: string | number | null, result: unknown): Rpc => ({ jsonrpc: "2.0", id, result });
const fail = (id: string | number | null, code: number, message: string): Rpc => ({ jsonrpc: "2.0", id, error: { code, message } });
export async function orgMcpHandle(db: Pool, auth: { organization: string; scopes: OrgScope[]; keyId: string }, raw: unknown): Promise<Rpc | null> {
  const parsed = rpcRequest.safeParse(raw);
  if (!parsed.success) return fail(null, -32600, "Invalid request");
  const req: RpcRequest = parsed.data;
  const id = req.id ?? null;
  if (req.method.startsWith("notifications/")) return null;
  if (req.method === "initialize")
    return reply(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "powerchair-football-manager-club", version: "1.0.0" }, instructions: "One club of Powerchair Football Manager, read only. The dues tool returns members' names: keep them for the club's own follow-up." });
  if (req.method === "ping") return reply(id, {});
  if (req.method === "tools/list") return reply(id, { tools: orgTools.filter((t) => auth.scopes.includes(t.scope)).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } })) });
  if (req.method !== "tools/call") return fail(id, -32601, "Method not found");
  const name = typeof req.params?.name === "string" ? req.params.name : "";
  const tool = orgTools.find((t) => t.name === name);
  if (!tool) return fail(id, -32602, "Unknown tool");
  if (!auth.scopes.includes(tool.scope)) return reply(id, { isError: true, content: [{ type: "text", text: `This key lacks the scope ${tool.scope}.` }] });
  const a = (req.params?.arguments && typeof req.params.arguments === "object" ? req.params.arguments : {}) as Record<string, unknown>;
  try {
    const out = await runOrgTool(db, auth.organization, tool.name, a);
    return reply(id, { content: [{ type: "text", text: JSON.stringify(out, null, 1) }], structuredContent: out as Record<string, unknown> });
  } catch (e) {
    return reply(id, { isError: true, content: [{ type: "text", text: e instanceof AccessError ? e.code : "ERROR" }] });
  }
}
