import { getDb } from "@/lib/db";
import { pollsExecute, pollsView } from "@/domains/polls/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** H3: mini polls. GET what I have to answer and what I asked; POST create, answer, close, outcome. */
export async function GET(request: Request) {
  try {
    return Response.json(await pollsView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 30000)));
    return Response.json(await pollsExecute(getDb(), p, body, body.organizationId), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
