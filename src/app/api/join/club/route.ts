import { throttle } from "@/lib/rate-limit";
import { getDb } from "@/lib/db";
import { clubRequestSchema, requestClub } from "@/domains/independent/service";
import { origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Public (12/11/2026): a club without a federation asks to join; a confirmation link leaves (same answer whatever the address). */
export async function POST(request: Request) {
  try {
    await throttle(getDb(), request, "public-write", "public-write-day");
    origin(request);
    const body = JSON.parse(new TextDecoder().decode(await bounded(request, 6000)));
    return Response.json(await requestClub(getDb(), clubRequestSchema.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
