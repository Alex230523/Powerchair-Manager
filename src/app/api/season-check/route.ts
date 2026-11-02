import { getDb } from "@/lib/db";
import { myChecks, seasonCheckCommand, seasonCheckExecute, seasonCheckView } from "@/domains/season-check/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** 8: what I still have to check this season; `?view=club` the club's follow-up. */
export async function GET(request: Request) {
  try {
    const p = await principal(request);
    const club = new URL(request.url).searchParams.get("view") === "club";
    return Response.json(club ? await seasonCheckView(getDb(), p) : await myChecks(getDb(), p), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 40000)));
    return Response.json(await seasonCheckExecute(getDb(), p, seasonCheckCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
