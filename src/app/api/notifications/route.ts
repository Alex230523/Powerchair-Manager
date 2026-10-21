import { getAuth } from "@/lib/auth-server";
import { getDb } from "@/lib/db";
import { AccessError } from "@/domains/access/service";
import {
  notificationBrief,
  notificationView,
  notificationExecute,
  notificationCommand,
} from "@/domains/notifications/service";
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
    "Notification request failed",
    e instanceof Error ? e.name : "unknown",
  );
  return Response.json({ error: "UNAVAILABLE" }, { status: 503, headers });
}
export async function GET(request: Request) {
  try {
    const brief = new URL(request.url).searchParams.get("brief") === "1";
    return Response.json(
      brief
        ? await notificationBrief(getDb(), await principal(request))
        : await notificationView(getDb(), await principal(request)),
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
    if (Number(request.headers.get("content-length")) > 16000)
      throw new AccessError("INVALID_INPUT", 400);
    const text = await request.text();
    if (text.length > 16000) throw new AccessError("INVALID_INPUT", 400);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new AccessError("INVALID_INPUT", 400);
    }
    return Response.json(
      await notificationExecute(
        getDb(),
        await principal(request),
        notificationCommand.parse(body),
        z.uuid().parse(body.organizationId),
      ),
      { headers },
    );
  } catch (e) {
    return failure(e);
  }
}
