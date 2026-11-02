import { parseScope } from "@/domains/scope/service";
import { getDb } from "@/lib/db";
import { financeOperations, operationsFilter } from "@/domains/finance/service";
import { principalIn, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** 13.3: the ledger, a page at a time, with its filters (`after` gives the next page). */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const filter = operationsFilter.parse({
      direction: params.get("direction") || undefined,
      category: params.get("category") || undefined,
      q: params.get("q") || undefined,
      after: params.get("after") || undefined,
    });
    return Response.json(await financeOperations(getDb(), await principalIn(request, "finance"), parseScope(params), filter), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
