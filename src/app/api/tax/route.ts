import { getDb } from "@/lib/db";
import { taxApprovalView, taxExecute, taxView } from "@/domains/tax/service";
import { taxCommand } from "@/domains/tax/schema";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** B8: tax receipts; ?approval=1 is the approval card of Réglages › Club, ?year= a year of gifts. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const p = await principal(request);
    if (q.get("approval") === "1") return Response.json(await taxApprovalView(getDb(), p), { headers: noStore });
    const year = q.get("year") ? z.coerce.number().int().min(2000).max(2100).parse(q.get("year")) : undefined;
    return Response.json(await taxView(getDb(), p, year), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 20000)));
    return Response.json(await taxExecute(getDb(), p, taxCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
