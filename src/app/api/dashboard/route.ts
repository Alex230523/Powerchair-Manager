import { getDb } from "@/lib/db";
import { failure, noStore, principal } from "@/lib/http";
import { dashboardView } from "@/domains/dashboard/service";
import { parseScope } from "@/domains/scope/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await dashboardView(getDb(), await principal(request), parseScope(new URL(request.url).searchParams)),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
