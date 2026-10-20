import { getDb } from "@/lib/db";
import { retentionView } from "@/domains/statistics/retention";
import { principalIn, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await retentionView(getDb(), await principalIn(request, "statistics")),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
