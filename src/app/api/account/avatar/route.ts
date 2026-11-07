import { getDb } from "@/lib/db";
import { userAvatar } from "@/domains/access/service";
import { principal, failure, servedType } from "@/lib/http";
export const dynamic = "force-dynamic";
/** The signed-in account's own photo (wave 11); nobody else's is served. */
export async function GET(request: Request) {
  try {
    const avatar = await userAvatar(getDb(), await principal(request));
    if (!avatar) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(avatar.content), {
      headers: {
        "Content-Type": servedType(avatar.media_type),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
