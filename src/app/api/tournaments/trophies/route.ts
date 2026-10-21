import { getDb } from "@/lib/db";
import { trophiesView } from "@/domains/tournaments/service";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** The trophy gallery. */
export async function GET(request: Request) {
  try {
    return Response.json(await trophiesView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
