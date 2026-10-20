// Shared helpers for every API route: session lookup, same-origin check,
// bounded body reading and uniform error responses (no internal details leak).
import { getAuth } from "@/lib/auth-server";
import { AccessError } from "@/domains/access/service";
import { ZodError } from "zod";
import { getDb } from "@/lib/db";
import { assertModule } from "@/domains/club/governance";
import type { OptionalModule } from "@/domains/access/rights";
export const noStore = { "Cache-Control": "private, no-store" };
export async function principal(request: Request) {
  const s = await getAuth().api.getSession({ headers: request.headers });
  if (!s) throw new AccessError("UNAUTHENTICATED", 401);
  return { userId: s.user.id, sessionId: s.session.id };
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
