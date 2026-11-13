import { getDb } from "@/lib/db";
import { failure, noStore, principal } from "@/lib/http";
import { dashboardView, dashboardWeek } from "@/domains/dashboard/service";
import { parseScope } from "@/domains/scope/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const week = params.get("week") ?? undefined;
    // 13/11/2026: ?week=…&only=week, the home's week alone.
    if (week && params.get("only") === "week") return Response.json(await dashboardWeek(getDb(), await principal(request), { ...parseScope(params), week }), { headers: noStore });
    return Response.json(
      await dashboardView(getDb(), await principal(request), { ...parseScope(params), ...(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? { week } : {}) }),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
