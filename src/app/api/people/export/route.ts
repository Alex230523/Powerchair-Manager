import { getAuth } from "@/lib/auth-server";
import { getDb } from "@/lib/db";
import { AccessError } from "@/domains/access/service";
import { peopleExport, filterSchema } from "@/domains/people/service";
import { z, ZodError } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session) throw new AccessError("UNAUTHENTICATED", 401);
    const params = Object.fromEntries(new URL(request.url).searchParams);
    return new Response(
      await peopleExport(
        getDb(),
        { userId: session.user.id, sessionId: session.session.id },
        filterSchema.parse(params),
        z.uuid().parse(params.organizationId),
      ),
      {
        headers: {
          ...headers,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="personnes.csv"',
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (e) {
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
