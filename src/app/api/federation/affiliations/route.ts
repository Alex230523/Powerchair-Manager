import { getDb } from "@/lib/db";
import { federationAffiliationsView, federationAffiliationsExecute } from "@/domains/affiliations/service";
import { federationAffiliationCommand } from "@/domains/affiliations/schema";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Wave 17 (N2): the federation's fees and which club paid. */
export async function GET(request: Request) {
  try {
    return Response.json(await federationAffiliationsView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
/** Create a fee for all clubs or chosen ones, archive it, remind the clubs that are late. */
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 40000)));
    return Response.json(await federationAffiliationsExecute(getDb(), p, federationAffiliationCommand.parse(body), z.uuid().parse(body.organizationId)), {
      headers: noStore,
    });
  } catch (e) {
    return failure(e);
  }
}
