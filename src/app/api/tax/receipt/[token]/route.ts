import { throttle } from "@/lib/rate-limit";
import { getDb } from "@/lib/db";
import { receiptByToken } from "@/domains/tax/service";
import { noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** B8, public: the private link of the e-mail opens the donor's own receipt, nothing else. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    await throttle(getDb(), _request, "public-read");
    const f = await receiptByToken(getDb(), z.string().regex(/^[A-Za-z0-9_-]{40,60}$/).parse((await params).token));
    return new Response(new Uint8Array(f.bytes), {
      headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(f.name), "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" },
    });
  } catch (e) {
    return failure(e);
  }
}
