import { getDb } from "@/lib/db";
import { circularFile } from "@/domains/circulars/service";
import { principal, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** 33: a circular's attachment, for its recipients and the federation's communication. */
export async function GET(request: Request) {
  try {
    const f = await circularFile(getDb(), await principal(request), z.uuid().parse(new URL(request.url).searchParams.get("id")));
    return new Response(new Uint8Array(f.content), {
      headers: {
        "Content-Type": f.media_type,
        "Content-Disposition": `attachment; filename="${f.filename.replace(/[^\w.\- ]/g, "_")}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
