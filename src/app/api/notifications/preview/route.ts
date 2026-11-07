import { getAuth } from "@/lib/auth-server";
import { getDb } from "@/lib/db";
import { countWrite, tooMany } from "@/lib/http";
import { AccessError } from "@/domains/access/service";
import { templatePreview } from "@/domains/notifications/service";
import { editableKinds } from "@/domains/notifications/templates";
import { z, ZodError } from "zod";
const schema = z.object({
  kind: z.enum(editableKinds),
  locale: z.enum(["fr", "nl", "en"]),
  subject: z.string().max(180),
  body: z.string().max(5000),
  organizationId: z.uuid(),
});
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    if (request.headers.get("origin") !== process.env.BETTER_AUTH_URL)
      throw new AccessError("INVALID_ORIGIN");
    const text = await request.text();
    if (text.length > 16000) throw new AccessError("INVALID_INPUT", 400);
    let input;
    try {
      input = JSON.parse(text);
    } catch {
      throw new AccessError("INVALID_INPUT", 400);
    }
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session) throw new AccessError("UNAUTHENTICATED", 401);
    await countWrite(request, session.user.id);
    return Response.json(
      await templatePreview(
        getDb(),
        { userId: session.user.id, sessionId: session.session.id },
        schema.parse(input),
      ),
      { headers },
    );
  } catch (e) {
    const flood = tooMany(e);
    if (flood) return flood;
    if (e instanceof AccessError)
      return Response.json({ error: e.code }, { status: e.status, headers });
    if (e instanceof ZodError)
      return Response.json(
        { error: "INVALID_INPUT" },
        { status: 400, headers },
      );
    return Response.json({ error: "UNAVAILABLE" }, { status: 503, headers });
  }
}
