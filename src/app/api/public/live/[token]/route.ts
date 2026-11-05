import { getDb } from "@/lib/db";
import { publicLive } from "@/domains/competitions/live-public";
export const dynamic = "force-dynamic";

/** Lot 3: the public match page refreshes from here, without an account; a wrong link answers 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const x = await publicLive(getDb(), token);
  if (!x) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  return Response.json(x, { headers: { "Cache-Control": "public, max-age=10" } });
}
