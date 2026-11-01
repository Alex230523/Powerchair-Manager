import { getDb } from "@/lib/db";
import { automationsExecute, automationsView } from "@/domains/automations/service";
import { automationCommand } from "@/domains/automations/schema";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** B7: the club's automations; ?simulate=1 adds « qui recevrait quoi aujourd'hui », without sending. */
export async function GET(request: Request) {
  try {
    const simulate = new URL(request.url).searchParams.get("simulate") === "1";
    return Response.json(await automationsView(getDb(), await principal(request), simulate), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 40000)));
    return Response.json(await automationsExecute(getDb(), p, automationCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
