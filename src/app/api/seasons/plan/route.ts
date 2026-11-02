import { getDb } from "@/lib/db";
import { seasonPlanCommand, seasonPlanExecute, seasonPlanView } from "@/domains/seasons/plan";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** 16: « Préparer la saison suivante », for the club's presidency. */
export async function GET(request: Request) {
  try {
    return Response.json(await seasonPlanView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 200000)));
    return Response.json(await seasonPlanExecute(getDb(), p, seasonPlanCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
