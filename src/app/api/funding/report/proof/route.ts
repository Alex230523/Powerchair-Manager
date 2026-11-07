import { throttle } from "@/lib/rate-limit";
import { getDb } from "@/lib/db";
import { partnerReportProof } from "@/domains/funding/service";
import { failure, servedType } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** A proof file of a delivered condition, reachable from the partner's public report only. */
export async function GET(request: Request) {
  try {
    await throttle(getDb(), request, "public-read");
    const q = new URL(request.url).searchParams;
    const f = await partnerReportProof(getDb(), q.get("t") ?? "", z.uuid().parse(q.get("id")));
    return new Response(new Uint8Array(f.content), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": servedType(f.media_type),
        "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(f.filename),
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
