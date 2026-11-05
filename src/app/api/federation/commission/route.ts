import { getDb } from "@/lib/db";
import { commissionCommand, commissionExecute, commissionView } from "@/domains/commission/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Lot 6 (05/11/2026): the commission's decisions, read and signed by its members. */
export async function GET(request: Request) {
  try {
    return Response.json(await commissionView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 8000)));
    return Response.json(await commissionExecute(getDb(), p, commissionCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
