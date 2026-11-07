import { getDb } from "@/lib/db";
import { gate } from "@/lib/http";
import { clientKey } from "@/lib/rate-limit";
import { securityEvent } from "@/domains/security/events";
import { McpAuthError, mcpAuth, mcpHandle } from "@/domains/mcp/service";
export const dynamic = "force-dynamic";

/**
 * Console, step 6 (06/11/2026): the MCP server (Streamable HTTP, stateless).
 * POST one JSON-RPC message or a batch with a bearer operator key; GET has no
 * stream to offer (405). Cookies are never read here.
 */
const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
export async function POST(request: Request) {
  const db = getDb();
  // Security (07/11/2026): counted by address before the key is read (a key guessed, a key revoked).
  const flood = await gate(request, "api-ip");
  if (flood) return flood;
  try {
    const auth = await mcpAuth(db, request.headers.get("authorization"));
    let body: unknown;
    try {
      const raw = await request.text();
      if (raw.length > 64000) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Too large" } }, { status: 413, headers });
      body = JSON.parse(raw);
    } catch {
      return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers });
    }
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.slice(0, 20).map((m) => mcpHandle(db, auth, m)))).filter((r) => r !== null);
      return out.length ? Response.json(out, { headers }) : new Response(null, { status: 202 });
    }
    const out = await mcpHandle(db, auth, body);
    return out ? Response.json(out, { headers }) : new Response(null, { status: 202 });
  } catch (e) {
    // Security (07/11/2026): a key refused is journaled by address (a key guessed, revoked, orphaned).
    if (e instanceof McpAuthError && e.status !== 429) await securityEvent(db, "key.invalid", { source: clientKey(request), details: { api: "mcp", code: e.code } });
    if (e instanceof McpAuthError) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: e.code } }, { status: e.status, headers: e.status === 401 ? { ...headers, "WWW-Authenticate": 'Bearer realm="console"' } : headers });
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } }, { status: 500, headers });
  }
}
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
