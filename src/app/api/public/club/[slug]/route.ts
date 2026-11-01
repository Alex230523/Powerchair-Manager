import { getDb } from "@/lib/db";
import { publicLogo } from "@/domains/integrations/public";
export const dynamic = "force-dynamic";
/** B6: the logo of a club whose page is public. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return new Response(null, { status: 404 });
  const logo = await publicLogo(getDb(), slug);
  if (!logo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(logo.content), { headers: { "Content-Type": logo.media_type, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" } });
}
