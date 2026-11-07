import { throttle } from "@/lib/rate-limit";
import { getDb } from "@/lib/db";
import { feedbackShot } from "@/domains/feedback/service";
import { noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** 19: a report's screenshot (already masked), linked from its private GitHub issue by an unguessable token. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    await throttle(getDb(), _request, "public-read");
    const { token } = await params;
    const bytes = await feedbackShot(getDb(), z.string().regex(/^[\w-]{20,64}$/).parse(token));
    return new Response(new Uint8Array(bytes), { headers: { ...noStore, "Content-Type": "image/png", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex", "Content-Security-Policy": "sandbox; default-src 'none'" } });
  } catch (e) {
    return failure(e);
  }
}
