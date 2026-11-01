import { getDb } from "@/lib/db";
import { workshopView, workshopExecute, workshopCommand } from "@/domains/equipment/workshop";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** B3: the workshop (alerts, chairs for the next events) and, with ?chair=, one chair's log. */
export async function GET(request: Request) {
  try {
    const chair = new URL(request.url).searchParams.get("chair");
    return Response.json(await workshopView(getDb(), await principalIn(request, "equipment"), chair ? z.uuid().parse(chair) : undefined), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "equipment");
    // A breakdown may carry a photo of 1 MB (base64).
    const body = JSON.parse(new TextDecoder().decode(await bounded(request, 1500000)));
    return Response.json(await workshopExecute(getDb(), p, workshopCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
