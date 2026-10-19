import { getAuth } from "@/lib/auth-server";
import { getDb } from "@/lib/db";
import { AccessError } from "@/domains/access/service";
import {
  peopleView,
  peopleExecute,
  peopleCommand,
  filterSchema,
} from "@/domains/people/service";
import { z, ZodError } from "zod";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
async function principal(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) throw new AccessError("UNAUTHENTICATED", 401);
  return { userId: session.user.id, sessionId: session.session.id };
}
function failure(e: unknown) {
  if (e instanceof AccessError)
    return Response.json({ error: e.code }, { status: e.status, headers });
  if (e instanceof ZodError)
    return Response.json({ error: "INVALID_INPUT" }, { status: 400, headers });
  console.error(
    "People request failed",
    e instanceof Error ? e.name : "unknown",
  );
  return Response.json({ error: "UNAVAILABLE" }, { status: 503, headers });
}
export async function GET(request: Request) {
  try {
    return Response.json(
      await peopleView(
        getDb(),
        await principal(request),
        filterSchema.parse(
          Object.fromEntries(new URL(request.url).searchParams),
        ),
      ),
      { headers },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== process.env.BETTER_AUTH_URL)
      throw new AccessError("INVALID_ORIGIN");
    // Large enough for a spreadsheet import of 300 players.
    const limit = 200000;
    if (Number(request.headers.get("content-length")) > limit)
      throw new AccessError("INVALID_INPUT", 400);
    const text = await request.text();
    if (text.length > limit) throw new AccessError("INVALID_INPUT", 400);
    let input;
    try {
      input = JSON.parse(text);
    } catch {
      throw new AccessError("INVALID_INPUT", 400);
    }
    return Response.json(
      await peopleExecute(
        getDb(),
        await principal(request),
        peopleCommand.parse(input),
        z.uuid().parse(input.organizationId),
      ),
      { headers },
    );
  } catch (e) {
    return failure(e);
  }
}
