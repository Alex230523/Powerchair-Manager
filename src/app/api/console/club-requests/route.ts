import { getDb } from "@/lib/db";
import { clubRequestCommand, clubRequestExecute, clubRequestsView } from "@/domains/independent/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Console (12/11/2026): the requests of clubs without a federation, accepted or refused by hand (owner and support). */
export async function GET(request: Request) {
  try {
    return Response.json(await clubRequestsView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 4000)));
    return Response.json(await clubRequestExecute(getDb(), p, clubRequestCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
