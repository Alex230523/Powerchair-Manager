import { getDb } from "@/lib/db";
import { tripsView, tripDetail, tripExecute } from "@/domains/trips/service";
import { tripCommand } from "@/domains/trips/schema";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** List (no id) or one trip (?id=). */
export async function GET(request: Request) {
  try {
    const p = await principalIn(request, "trips");
    const id = new URL(request.url).searchParams.get("id");
    return Response.json(
      id
        ? await tripDetail(getDb(), p, z.uuid().parse(id))
        : await tripsView(getDb(), p),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "trips"),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 60000)));
    return Response.json(
      await tripExecute(
        getDb(),
        p,
        tripCommand.parse(body),
        z.uuid().parse(body.organizationId),
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
