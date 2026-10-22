import { getDb } from "@/lib/db";
import { eventTypesView } from "@/domains/calendar/service";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Wave 16 (E1): the club's event types (changes go through POST /api/calendar). */
export async function GET(request: Request) {
  try {
    return Response.json(await eventTypesView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
