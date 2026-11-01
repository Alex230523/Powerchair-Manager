import { getDb } from "@/lib/db";
import { journeyCommand, journeyExecute, journeyView } from "@/domains/competitions/journey";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** A5: the match sheet in three steps (before, match day, after). */
export async function GET(request: Request) {
  try {
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    return Response.json(await journeyView(getDb(), await principalIn(request, "matches"), id), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "matches"),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 20000)));
    return Response.json(await journeyExecute(getDb(), p, journeyCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
