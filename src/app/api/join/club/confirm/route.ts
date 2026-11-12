import { throttle } from "@/lib/rate-limit";
import { getDb } from "@/lib/db";
import { clubConfirmSchema, confirmClub } from "@/domains/independent/service";
import { origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Public (12/11/2026): the link of the e-mail; the request goes to the platform's team. */
export async function POST(request: Request) {
  try {
    await throttle(getDb(), request, "public-write", "public-write-day");
    origin(request);
    const body = JSON.parse(new TextDecoder().decode(await bounded(request, 1000)));
    return Response.json(await confirmClub(getDb(), clubConfirmSchema.parse(body).token), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
