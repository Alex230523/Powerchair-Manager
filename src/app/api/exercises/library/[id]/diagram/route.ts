import { getDb } from "@/lib/db";
import { libraryDiagram } from "@/domains/exercises/library";
import { principal, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** 4: the image or PDF of a published federal sheet, for its federation's members. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const d = await libraryDiagram(getDb(), await principal(request), (await params).id);
    return new Response(new Uint8Array(d.content), {
      headers: {
        "Content-Type": d.media_type,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
