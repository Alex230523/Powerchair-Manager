import { getDb } from "@/lib/db";
import { newsExecute, newsView } from "@/domains/news/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** 20: « Nouveautés »: GET the entries for my role (?all=1 every one), POST read or the window switched off. */
export async function GET(request: Request) {
  try {
    const all = new URL(request.url).searchParams.get("all") === "1";
    return Response.json(await newsView(getDb(), await principal(request), all), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 20000)));
    return Response.json(await newsExecute(getDb(), p, body), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
