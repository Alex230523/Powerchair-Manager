import { getDb } from "@/lib/db";
import { exerciseDiagram } from "@/domains/exercises/service";
import { principal, failure, servedType } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Wave 16 (E2): the diagram of a sheet, for a reader who sees it. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const d = await exerciseDiagram(getDb(), await principal(request), (await params).id);
    return new Response(new Uint8Array(d.content), {
      headers: {
        "Content-Type": servedType(d.media_type),
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
