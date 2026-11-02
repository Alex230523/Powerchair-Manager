import { getDb } from "@/lib/db";
import { authorizationCommand, authorizationsExecute, authorizationsView } from "@/domains/authorizations/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** 28: the club's authorization texts (Réglages › Documents). */
export async function GET(request: Request) {
  try {
    return Response.json(await authorizationsView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
/** 28: save a text, ask every minor, remind; a representative refuses. */
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 80000)));
    return Response.json(await authorizationsExecute(getDb(), p, authorizationCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
