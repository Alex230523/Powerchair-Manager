import { getDb } from "@/lib/db";
import { failure, noStore, principal } from "@/lib/http";
import { dashboardView } from "@/domains/dashboard/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await dashboardView(getDb(), await principal(request)),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
