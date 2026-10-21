import { getDb } from "@/lib/db";
import { fundingTasksView } from "@/domains/funding/service";
import { principalIn, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** Tasks of the sponsor and grant files (wave 15): all for money people, one's own otherwise. */
export async function GET(request: Request) {
  try {
    return Response.json(await fundingTasksView(getDb(), await principalIn(request, "finance")), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
