import { z } from "zod";
import { getDb } from "@/lib/db";
import { tournamentCommand } from "@/domains/tournaments/schema";
import { tournamentExecute, tournamentsView } from "@/domains/tournaments/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** Tournaments of a year (?year=2026), and every command on a tournament. */
export async function GET(request: Request) {
  try {
    const year = z.coerce.number().int().min(2000).max(2100).catch(new Date().getFullYear()).parse(new URL(request.url).searchParams.get("year") ?? undefined);
    return Response.json(await tournamentsView(getDb(), await principal(request), year), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 40000)));
    return Response.json(await tournamentExecute(getDb(), p, tournamentCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
