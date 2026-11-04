import { getDb } from "@/lib/db";
import { feedbackSubmit, feedbackView } from "@/domains/feedback/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** 19: « Signaler un problème »: GET my reports and their state; POST a new one (sent to GitHub by the server). */
export async function GET(request: Request) {
  try {
    return Response.json(await feedbackView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 4600000)));
    return Response.json(await feedbackSubmit(getDb(), p, body), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
