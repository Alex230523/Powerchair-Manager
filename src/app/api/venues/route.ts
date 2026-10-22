import { getDb } from "@/lib/db";
import { venuesView, venueExecute, venueCommand, placeCommand } from "@/domains/venues/service";
import { z } from "zod";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(await venuesView(getDb(), await principal(request)), {
      headers: noStore,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 20000)));
    // Wave 17 (C4): the club's places and the federation's decisions, checked against the active organization.
    const place = ["savePlace", "addRate", "proposeShare", "decide", "withdraw"].includes(body?.action);
    return Response.json(
      await venueExecute(
        getDb(),
        p,
        place ? placeCommand.parse(body) : venueCommand.parse(body),
        body?.organizationId ? z.uuid().parse(body.organizationId) : undefined,
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
