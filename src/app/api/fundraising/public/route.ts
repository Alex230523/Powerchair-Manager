import { throttle } from "@/lib/rate-limit";
import { getDb } from "@/lib/db";
import { publicPot } from "@/domains/fundraising/service";
import { failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** Public progress of a pot shared by its club: goal and progress only. */
export async function GET(request: Request) {
  try {
    await throttle(getDb(), request, "public-read");
    const token = new URL(request.url).searchParams.get("t") ?? "";
    return Response.json(await publicPot(getDb(), token), {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch (e) {
    return failure(e);
  }
}
