import { getDb } from "@/lib/db";
import { incidentCommand, incidentsExecute, incidentsView } from "@/domains/incidents/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** B5: the incidents this person may see, and what they may do. */
export async function GET(request: Request) {
  try {
    return Response.json(await incidentsView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request);
    // Up to three photos of 1 MB, or a paper of 2 MB (base64).
    const body = JSON.parse(new TextDecoder().decode(await bounded(request, 4500000)));
    return Response.json(await incidentsExecute(getDb(), p, incidentCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
