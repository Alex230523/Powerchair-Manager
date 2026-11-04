import { getDb } from "@/lib/db";
import { answerCommand, answerExecute, playerNational } from "@/domains/national/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** 6: « Sélection nationale » on a player's sheet; the player's (or parent's) answers. */
export async function GET(request: Request) {
  try {
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    return Response.json(await playerNational(getDb(), await principal(request), id), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 10000)));
    return Response.json(await answerExecute(getDb(), p, answerCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
