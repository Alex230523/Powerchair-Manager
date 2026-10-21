import { getDb } from "@/lib/db";
import { moneyDeadlines } from "@/domains/funding/service";
import { principalIn, noStore, failure } from "@/lib/http";
import { AccessError } from "@/domains/access/service";
export const dynamic = "force-dynamic";
const day = /^\d{4}-\d{2}-\d{2}$/;
/** The "Échéances" layer of the calendar (wave 15): computed from the files, between two days (at most 400 days). */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const from = q.get("from") ?? "",
      to = q.get("to") ?? "";
    if (!day.test(from) || !day.test(to) || to < from || Date.parse(to) - Date.parse(from) > 400 * 86400000) throw new AccessError("INVALID_INPUT", 400);
    return Response.json(await moneyDeadlines(getDb(), await principalIn(request, "finance"), from, to), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
