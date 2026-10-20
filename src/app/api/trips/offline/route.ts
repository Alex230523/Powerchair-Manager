import { getDb } from "@/lib/db";
import { tripOfflinePack } from "@/domains/trips/service";
import { principalIn, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/**
 * The offline book of a trip, as JSON. The browser encrypts it with a code
 * before storing it; never cached (the service worker skips /api).
 */
export async function GET(request: Request) {
  try {
    const p = await principalIn(request, "trips");
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    return Response.json(await tripOfflinePack(getDb(), p, id), {
      headers: { ...noStore, "Referrer-Policy": "no-referrer" },
    });
  } catch (e) {
    return failure(e);
  }
}
