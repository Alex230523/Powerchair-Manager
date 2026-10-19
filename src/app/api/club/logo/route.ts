import { getDb } from "@/lib/db";
import { clubLogo } from "@/domains/club/service";
import { failure } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const logo = await clubLogo(
      getDb(),
      new URL(request.url).searchParams.get("org") ?? "",
    );
    if (!logo) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(logo.content), {
      headers: {
        "Content-Type": logo.media_type,
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
