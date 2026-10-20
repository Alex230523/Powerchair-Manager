import { getDb } from "@/lib/db";
import { search } from "@/domains/search/service";
import { AccessError } from "@/domains/access/service";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
const empty = { people: [], teams: [], events: [] };
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    if (q.trim().length < 2) return Response.json(empty, { headers: noStore });
    try {
      return Response.json(
        await search(getDb(), await principal(request), q),
        { headers: noStore },
      );
    } catch (e) {
      // Without a club profile there is nothing to search beyond the menu.
      if (e instanceof AccessError && ["CLUB_ONLY", "CONTEXT_REQUIRED", "FORBIDDEN"].includes(e.code))
        return Response.json(empty, { headers: noStore });
      throw e;
    }
  } catch (e) {
    return failure(e);
  }
}
