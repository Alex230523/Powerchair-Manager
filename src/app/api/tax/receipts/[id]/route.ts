import { getDb } from "@/lib/db";
import { receiptFile } from "@/domains/tax/service";
import { principal, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** B8: a receipt as a PDF, for the club's money rights. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const f = await receiptFile(getDb(), await principal(request), z.uuid().parse((await params).id));
    return new Response(new Uint8Array(f.bytes), {
      headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(f.name), "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    return failure(e);
  }
}
