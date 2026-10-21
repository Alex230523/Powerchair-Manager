import { getDb } from "@/lib/db";
import { failure, noStore, principal } from "@/lib/http";
import { dashboardView } from "@/domains/dashboard/service";
import { parseScope } from "@/domains/scope/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const week = params.get("week") ?? undefined;
    return Response.json(
      await dashboardView(getDb(), await principal(request), { ...parseScope(params), ...(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? { week } : {}) }),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
