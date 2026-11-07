import { getDb } from "@/lib/db";
import { gate } from "@/lib/http";
import { clientKey } from "@/lib/rate-limit";
import { securityEvent } from "@/domains/security/events";
import { ApiError, apiAuth } from "@/domains/integrations/api";

/** B6: one v1 endpoint: the key and its scope, the rate limit, JSON without cache. */
export async function apiV1(request: Request, scope: string, fn: (org: string, q: URLSearchParams) => Promise<unknown>) {
  // Security (07/11/2026): counted by network address before the key is read (a key guessed, a key revoked).
  const flood = await gate(request, "api-ip");
  if (flood) return flood;
  try {
    const auth = await apiAuth(getDb(), request.headers.get("authorization"), scope);
    const data = await fn(auth.organization, new URL(request.url).searchParams);
    return Response.json({ data }, { headers: { "Cache-Control": "no-store", "X-RateLimit-Limit": "60", "X-RateLimit-Remaining": String(auth.remaining) } });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.code === "KEY_ORPHANED")) await securityEvent(getDb(), "key.invalid", { source: clientKey(request), details: { api: "v1", code: e.code } });
    if (e instanceof ApiError)
      return Response.json({ error: e.code }, { status: e.status, headers: { "Cache-Control": "no-store", ...(e.retryAfter ? { "Retry-After": String(e.retryAfter) } : {}), ...(e.status === 401 ? { "WWW-Authenticate": "Bearer" } : {}) } });
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
