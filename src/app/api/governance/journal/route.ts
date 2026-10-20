import { getDb } from "@/lib/db";
import { journalView, journalQuery } from "@/domains/club/governance";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** Rights journal (audit.read) or health data access journal (president). */
export async function GET(request: Request) {
  try {
    const u = new URL(request.url).searchParams;
    const q = journalQuery.parse({
      kind: u.get("kind"),
      userId: u.get("user") || undefined,
      from: u.get("from") || undefined,
      to: u.get("to") || undefined,
    });
    return Response.json(
      await journalView(getDb(), await principal(request), q),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
