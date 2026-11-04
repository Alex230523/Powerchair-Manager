import { getDb } from "@/lib/db";
import { recruitmentExecute, recruitmentView, trialChairs } from "@/domains/recruitment/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** H1: the prospects, partners and indicators (?chairs=1&event=|day= the club chairs free for a trial); POST the commands. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const p = await principal(request);
    if (q.get("chairs") === "1") {
      const event = q.get("event"),
        day = q.get("day");
      return Response.json(await trialChairs(getDb(), p, event ? z.uuid().parse(event) : null, day ? z.iso.date().parse(day) : null), { headers: noStore });
    }
    return Response.json(await recruitmentView(getDb(), p), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 10000)));
    return Response.json(await recruitmentExecute(getDb(), p, body, body?.organizationId), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
