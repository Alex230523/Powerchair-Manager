import { getDb } from "@/lib/db";
import { obligationsView, obligationsExecute, obligationCommand } from "@/domains/club/obligations";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Wave 16 (A): the club's status and obligations of a year. */
export async function GET(request: Request) {
  try {
    const year = Number(new URL(request.url).searchParams.get("year")) || undefined;
    return Response.json(await obligationsView(getDb(), await principal(request), { year }), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 20000)));
    return Response.json(await obligationsExecute(getDb(), p, obligationCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
