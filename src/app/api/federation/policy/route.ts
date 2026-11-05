import { getDb } from "@/lib/db";
import { policyCommand, policyExecute, policyView } from "@/domains/federation/policy-service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** International, step 2 (05/11/2026): the federation's rulebook (amounts) and country. */
export async function GET(request: Request) {
  try {
    return Response.json(await policyView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 8000)));
    return Response.json(await policyExecute(getDb(), p, policyCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
