import { gate } from "@/lib/http";
import { getDb } from "@/lib/db";
import { publicIcs } from "@/domains/integrations/public";
export const dynamic = "force-dynamic";
/** B6: the club's public calendar (matches and open events), distinct from the private feed, revocable. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const flood = await gate(request, "public-read");
  if (flood) return flood;
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return new Response(null, { status: 404 });
  const ics = await publicIcs(getDb(), token, process.env.BETTER_AUTH_URL ?? new URL(request.url).origin);
  if (!ics) return new Response(null, { status: 404 });
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "public, max-age=900", "X-Content-Type-Options": "nosniff" } });
}
