import { gate } from "@/lib/http";
import { getDb } from "@/lib/db";
import { publicLive } from "@/domains/competitions/live-public";
export const dynamic = "force-dynamic";

/** Lot 3: the public match page refreshes from here, without an account; a wrong link answers 404. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const flood = await gate(request, "public-read");
  if (flood) return flood;
  const { token } = await params;
  const x = await publicLive(getDb(), token);
  if (!x) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  return Response.json(x, { headers: { "Cache-Control": "public, max-age=10" } });
}
