import { getDb } from "@/lib/db";
import { familyChildren, familyCommand, familyExecute, familyView } from "@/domains/family/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** 27: « Ma famille », the children of every club; `?children=1` the children only (the switcher). */
export async function GET(request: Request) {
  try {
    const p = await principal(request);
    const brief = new URL(request.url).searchParams.get("children") === "1";
    return Response.json(brief ? await familyChildren(getDb(), p) : await familyView(getDb(), p), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
/** 29: one's own contacts in a club. */
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 8000)));
    return Response.json(await familyExecute(getDb(), p, familyCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
