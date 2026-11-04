import { getDb } from "@/lib/db";
import { bookingFile, bookingFileUpload } from "@/domains/venues/bookings";
import { receiptMaxBytes } from "@/domains/finance/schema";
import { AccessError } from "@/domains/access/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

const target = (q: URLSearchParams) => ({ kind: z.enum(["confirmation", "invoice"]).parse(q.get("kind")), id: z.uuid().parse(q.get("id")) });

/** 18: a booking's confirmation or an invoice's file (?kind=confirmation|invoice&id=), shown inline and sandboxed. */
export async function GET(request: Request) {
  try {
    const f = await bookingFile(getDb(), await principal(request), target(new URL(request.url).searchParams));
    return new Response(new Uint8Array(f.content), {
      headers: {
        ...noStore,
        "Content-Type": f.media_type,
        "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(f.filename),
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}

/** Uploads it, multipart field « file » with « organizationId ». */
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      bytes = await bounded(request, receiptMaxBytes + 200000);
    let d: FormData;
    try {
      d = await new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type") ?? "" }, body: bytes }).formData();
    } catch {
      throw new AccessError("INVALID_FILE", 400);
    }
    const f = d.get("file");
    if (!(f instanceof File)) throw new AccessError("INVALID_FILE", 400);
    return Response.json(
      await bookingFileUpload(getDb(), p, target(new URL(request.url).searchParams), { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }, z.uuid().parse(d.get("organizationId"))),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
