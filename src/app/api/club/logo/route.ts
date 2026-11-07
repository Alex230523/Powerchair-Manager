import { throttle } from "@/lib/rate-limit";
import { getDb } from "@/lib/db";
import { clubLogo, clubLogoForForm } from "@/domains/club/service";
import { publicHallLogo } from "@/domains/awards/service";
import { failure, servedType } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await throttle(getDb(), request, "public-read");
    // ?org= for members, ?form= on public registration pages, ?hall= on the public Hall of fame (no club id exposed).
    const q = new URL(request.url).searchParams;
    const form = q.get("form"),
      hall = q.get("hall");
    const logo = form
      ? await clubLogoForForm(getDb(), form)
      : hall
        ? await publicHallLogo(getDb(), hall)
        : await clubLogo(getDb(), q.get("org") ?? "");
    if (!logo) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(logo.content), {
      headers: {
        "Content-Type": servedType(logo.media_type),
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
