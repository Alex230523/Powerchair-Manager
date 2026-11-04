import { getDb } from "@/lib/db";
import { fineCommand, finesExecute, finesView } from "@/domains/fines/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Point 10: the federation's fines (its clubs'), or the club's own. */
export async function GET(request: Request) {
  try {
    return Response.json(await finesView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 6000)));
    return Response.json(await finesExecute(getDb(), p, fineCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
