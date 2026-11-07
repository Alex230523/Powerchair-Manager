// Shared helpers for every API route: session lookup, same-origin check,
// bounded body reading and uniform error responses (no internal details leak).
import { getAuth } from "@/lib/auth-server";
import { AccessError } from "@/domains/access/service";
import { ZodError } from "zod";
import { getDb } from "@/lib/db";
import { assertModule } from "@/domains/club/governance";
import type { OptionalModule } from "@/domains/access/rights";
export const noStore = { "Cache-Control": "private, no-store" };
// Security (07/11/2026), cross-site scripting: how a stored file is sent (src/lib/html.ts).
export { disposition, servedType } from "./html";
export async function principal(request: Request) {
  const s = await getAuth().api.getSession({ headers: request.headers });
  if (!s) throw new AccessError("UNAUTHENTICATED", 401);
  const p = { userId: s.user.id, sessionId: s.session.id };
  // Console, step 3 (05/11/2026): an organisation suspended by the platform is read only for its
  // members; switching context, the account and the console itself stay reachable.
  if (request.method !== "GET" && request.method !== "HEAD" && !/^\/api\/(workspace|account|auth|console|feedback|support)(\/|$)/.test(new URL(request.url).pathname)) {
    const r = await getDb().query("SELECT 1 FROM active_context c JOIN organization o ON o.id=c.organization_id WHERE c.session_id=$1 AND c.user_id=$2 AND o.suspended_at IS NOT NULL", [p.sessionId, p.userId]);
    if (r.rowCount) throw new AccessError("ORG_SUSPENDED", 403);
  }
  return p;
}
/** Session of a route that belongs to a module the club may switch off. */
export async function principalIn(request: Request, module: OptionalModule) {
  const p = await principal(request);
  await assertModule(getDb(), p, module);
  return p;
}
export function origin(request: Request) {
  if (request.headers.get("origin") !== process.env.BETTER_AUTH_URL)
    throw new AccessError("INVALID_ORIGIN");
}
export async function bounded(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new AccessError("TOO_LARGE", 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new AccessError("TOO_LARGE", 413);
    }
    chunks.push(value);
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
export function failure(e: unknown) {
  if (e instanceof AccessError)
    return Response.json(
      { error: e.code },
      { status: e.status, headers: noStore },
    );
  if (e instanceof ZodError || e instanceof SyntaxError)
    return Response.json(
      { error: "INVALID_INPUT" },
      { status: 400, headers: noStore },
    );
  console.error("API request failed", e instanceof Error ? e.name : "unknown");
  return Response.json(
    { error: "UNAVAILABLE" },
    { status: 503, headers: noStore },
  );
}
