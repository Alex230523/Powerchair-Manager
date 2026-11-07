import { getDb } from "@/lib/db";
import { guideImage } from "@/domains/guide/knowledge";
import { principal, failure, servedType } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** A gallery image (?id=) or a chair model's photo (&kind=photo), for the federation's readers; a public chapter's images for anyone. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const id = z.uuid().parse(q.get("id"));
    const kind = q.get("kind") === "photo" ? "photo" : "image";
    const p = await principal(request).catch(() => null);
    const img = await guideImage(getDb(), p, id, kind);
    return new Response(new Uint8Array(img.content), {
      headers: {
        "Content-Type": servedType(img.media_type),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
