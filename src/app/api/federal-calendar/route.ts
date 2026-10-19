import { getDb } from "@/lib/db";
import { federalCalendarView } from "@/domains/federation/service";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await federalCalendarView(getDb(), await principal(request)),
      {
        headers: noStore,
      },
    );
  } catch (e) {
    return failure(e);
  }
}
