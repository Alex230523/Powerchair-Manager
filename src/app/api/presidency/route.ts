import { getDb } from "@/lib/db";
import { presidencyCommand, presidencyExecute, presidencyView } from "@/domains/access/presidency";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Wave 17 (G1): hand over the club presidency (Settings > Members). */
export async function GET(request: Request) {
  try {
    return Response.json(await presidencyView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request);
    const body = JSON.parse(new TextDecoder().decode(await bounded(request, 6000)));
    return Response.json(await presidencyExecute(getDb(), p, presidencyCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
