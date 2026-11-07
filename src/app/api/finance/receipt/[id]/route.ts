import { getDb } from "@/lib/db";
import {
  financeReceiptFile,
  financeReceiptUpload,
} from "@/domains/finance/service";
import { receiptMaxBytes } from "@/domains/finance/schema";
import { principalIn, origin, bounded, noStore, failure, servedType } from "@/lib/http";
import { AccessError } from "@/domains/access/service";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Download a receipt (id = receipt). Shown inline for PDF and images, sandboxed. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const f = await financeReceiptFile(
      getDb(),
      await principalIn(request, "finance"),
      z.uuid().parse((await params).id),
    );
    return new Response(new Uint8Array(f.content), {
      headers: {
        ...noStore,
        "Content-Type": servedType(f.media_type),
        "Content-Disposition":
          "inline; filename*=UTF-8''" + encodeURIComponent(f.filename),
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}

/** Upload a receipt for a ledger line (id = transaction), multipart field "file". */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    origin(request);
    const p = await principalIn(request, "finance"),
      bytes = await bounded(request, receiptMaxBytes + 200000);
    let d: FormData;
    try {
      d = await new Request(request.url, {
        method: "POST",
        headers: { "content-type": request.headers.get("content-type") ?? "" },
        body: bytes,
      }).formData();
    } catch {
      throw new AccessError("INVALID_FILE", 400);
    }
    const f = d.get("file");
    if (!(f instanceof File)) throw new AccessError("INVALID_FILE", 400);
    return Response.json(
      await financeReceiptUpload(
        getDb(),
        p,
        z.uuid().parse((await params).id),
        { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) },
        z.uuid().parse(d.get("organizationId")),
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
