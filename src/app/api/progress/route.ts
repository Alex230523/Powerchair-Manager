import { getDb } from "@/lib/db";
import { progressCommand, progressExecute, progressView } from "@/domains/progress/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** 31: a player's follow-up (« Mon suivi »): numbers, objectives, feedback, the coach's private notes. */
export async function GET(request: Request) {
  try {
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    return Response.json(await progressView(getDb(), await principal(request), id), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 20000)));
    return Response.json(await progressExecute(getDb(), p, progressCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
