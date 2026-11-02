import { getDb } from "@/lib/db";
import { scheduleCommand, scheduleExecute, scheduleView } from "@/domains/calendar/season-schedule";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** H9: the season planner, the school holidays of reference and the closures. */
export async function GET(request: Request) {
  try {
    return Response.json(await scheduleView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 120000)));
    return Response.json(await scheduleExecute(getDb(), p, scheduleCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
