import { getDb } from "@/lib/db";
import { alertPrefCommand, alertPrefSave, alertPrefView } from "@/domains/console/metrics";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Console, series A (06/11/2026): the operator's daily alert, its rules and hour. */
export async function GET(request: Request) {
  try {
    return Response.json(await alertPrefView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 4000)));
    return Response.json(await alertPrefSave(getDb(), p, alertPrefCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
