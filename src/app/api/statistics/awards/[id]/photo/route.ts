import { getDb } from "@/lib/db";
import { awardPhoto } from "@/domains/awards/service";
import { principalIn, failure, servedType } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Wave 16 (S1): the photo of a prize, for a member of the club. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await awardPhoto(getDb(), await principalIn(request, "statistics"), (await params).id);
    return new Response(new Uint8Array(r.photo), {
      headers: {
        "Content-Type": servedType(r.photo_type),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
