import { getDb } from "@/lib/db";
import { openEventCommand, openEventsExecute, openEventsView } from "@/domains/open-events/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** B9: the club's open events, and with ?id= one of them with its registrations and opinions. */
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    return Response.json(await openEventsView(getDb(), await principal(request), id ? z.uuid().parse(id) : undefined), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request);
    const body = JSON.parse(new TextDecoder().decode(await bounded(request, 50000)));
    return Response.json(await openEventsExecute(getDb(), p, openEventCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
