import { getDb } from "@/lib/db";
import { exercisesView, exerciseExecute, exerciseCommand } from "@/domains/exercises/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Wave 16 (E2): the club's exercise sheets. */
export async function GET(request: Request) {
  try {
    return Response.json(await exercisesView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 3000000)));
    return Response.json(await exerciseExecute(getDb(), p, exerciseCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
