import { getDb } from "@/lib/db";
import { gate } from "@/lib/http";
import { clientKey } from "@/lib/rate-limit";
import { securityEvent } from "@/domains/security/events";
import { OrgMcpAuthError, orgMcpAuth, orgMcpHandle } from "@/domains/mcp/organization";
export const dynamic = "force-dynamic";

/**
 * Console, series E (06/11/2026): a club's own MCP server (Streamable HTTP,
 * stateless, read only). POST one JSON-RPC message or a batch with a bearer
 * key of the club; GET has no stream to offer (405). Cookies are never read.
 */
const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
export async function POST(request: Request) {
  const db = getDb();
  // Security (07/11/2026): counted by address before the key is read (a key guessed, a key revoked).
  const flood = await gate(request, "api-ip");
  if (flood) return flood;
  try {
    const auth = await orgMcpAuth(db, request.headers.get("authorization"));
    let body: unknown;
    try {
      const raw = await request.text();
      if (raw.length > 64000) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Too large" } }, { status: 413, headers });
      body = JSON.parse(raw);
    } catch {
      return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers });
    }
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.slice(0, 20).map((m) => orgMcpHandle(db, auth, m)))).filter((r) => r !== null);
      return out.length ? Response.json(out, { headers }) : new Response(null, { status: 202 });
    }
    const out = await orgMcpHandle(db, auth, body);
    return out ? Response.json(out, { headers }) : new Response(null, { status: 202 });
  } catch (e) {
    // Security (07/11/2026): a key refused is journaled by address (a key guessed, revoked, orphaned).
    if (e instanceof OrgMcpAuthError && e.status !== 429) await securityEvent(db, "key.invalid", { source: clientKey(request), details: { api: "mcp-org", code: e.code } });
    if (e instanceof OrgMcpAuthError) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: e.code } }, { status: e.status, headers: e.status === 401 ? { ...headers, "WWW-Authenticate": 'Bearer realm="club"' } : headers });
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } }, { status: 500, headers });
  }
}
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
