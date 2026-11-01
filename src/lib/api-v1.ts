import { getDb } from "@/lib/db";
import { ApiError, apiAuth } from "@/domains/integrations/api";

/** B6: one v1 endpoint: the key and its scope, the rate limit, JSON without cache. */
export async function apiV1(request: Request, scope: string, fn: (org: string, q: URLSearchParams) => Promise<unknown>) {
  try {
    const auth = await apiAuth(getDb(), request.headers.get("authorization"), scope);
    const data = await fn(auth.organization, new URL(request.url).searchParams);
    return Response.json({ data }, { headers: { "Cache-Control": "no-store", "X-RateLimit-Limit": "60", "X-RateLimit-Remaining": String(auth.remaining) } });
  } catch (e) {
    if (e instanceof ApiError)
      return Response.json({ error: e.code }, { status: e.status, headers: { "Cache-Control": "no-store", ...(e.retryAfter ? { "Retry-After": String(e.retryAfter) } : {}), ...(e.status === 401 ? { "WWW-Authenticate": "Bearer" } : {}) } });
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
