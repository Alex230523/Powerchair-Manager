import { getDb } from "@/lib/db";
import { integrationCommand, integrationsExecute, integrationsView } from "@/domains/integrations/public";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** B6: the club's public page, widgets, consents, API keys and webhooks (presidency). */
export async function GET(request: Request) {
  try {
    return Response.json(await integrationsView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request);
    const body = JSON.parse(new TextDecoder().decode(await bounded(request, 10000)));
    return Response.json(await integrationsExecute(getDb(), p, integrationCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
