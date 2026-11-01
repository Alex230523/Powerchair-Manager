import { getDb } from "@/lib/db";
import { statementFile } from "@/domains/finance/service";
import { principalIn, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Download a statement, sandboxed. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const f = await statementFile(getDb(), await principalIn(request, "finance"), z.uuid().parse((await params).id));
    return new Response(new Uint8Array(f.content), {
      headers: {
        ...noStore,
        "Content-Type": f.media_type === "text/csv" ? "text/csv; charset=utf-8" : f.media_type,
        "Content-Disposition": (f.media_type === "text/csv" ? "attachment" : "inline") + "; filename*=UTF-8''" + encodeURIComponent(f.filename),
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
