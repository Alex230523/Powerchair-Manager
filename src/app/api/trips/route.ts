import { getDb } from "@/lib/db";
import { estimateStop, roadSheet, tripsView, tripDetail, tripExecute } from "@/domains/trips/service";
import { tripCommand } from "@/domains/trips/schema";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** List (no id), one trip (?id=), or its road sheet (?id=&sheet=1). */
export async function GET(request: Request) {
  try {
    const p = await principalIn(request, "trips");
    const q = new URL(request.url).searchParams;
    const id = q.get("id");
    return Response.json(
      id
        ? q.get("sheet") === "1"
          ? await roadSheet(getDb(), p, z.uuid().parse(id))
          : await tripDetail(getDb(), p, z.uuid().parse(id))
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
    const command = tripCommand.parse(body);
    const org = z.uuid().parse(body.organizationId);
    return Response.json(
      // 8: the estimate reaches outside, apart from any transaction.
      command.action === "estimate" ? await estimateStop(getDb(), p, command.stopId, org) : await tripExecute(getDb(), p, command, org),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
