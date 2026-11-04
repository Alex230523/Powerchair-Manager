import { getDb } from "@/lib/db";
import { personOverview } from "@/domains/player-profile/service";
import { principal, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** 40: « Vue d'ensemble » of a person's sheet, each block by the reader's rights. */
export async function GET(request: Request) {
  try {
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    return Response.json(await personOverview(getDb(), await principal(request), id), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
