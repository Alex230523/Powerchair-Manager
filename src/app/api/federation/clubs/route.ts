import { getDb } from "@/lib/db";
import { federationClubsView, federationClubsExecute, federationClubsCommand } from "@/domains/federation/clubs";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Wave 16 (I3): clubs and presidents of the federation. */
export async function GET(request: Request) {
  try {
    return Response.json(await federationClubsView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
/** Create a club, invite a president or a referee, send again or cancel an invitation. */
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 20000)));
    return Response.json(await federationClubsExecute(getDb(), p, federationClubsCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
