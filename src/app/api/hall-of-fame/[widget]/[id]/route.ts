import { getDb } from "@/lib/db";
import { publicAwardPhoto } from "@/domains/awards/service";
import { failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Wave 16 (S1): a published photo of the public Hall of fame (no account; only prizes ticked « Peut être publié »). */
export async function GET(_request: Request, { params }: { params: Promise<{ widget: string; id: string }> }) {
  try {
    const { widget, id } = await params;
    const r = await publicAwardPhoto(getDb(), widget, id);
    if (!r) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(r.photo), {
      headers: {
        "Content-Type": r.photo_type,
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
