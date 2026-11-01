import { getDb } from "@/lib/db";
import { publicCommand, publicEvent, publicExecute } from "@/domains/open-events/service";
import { origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
const token = z.string().regex(/^[A-Za-z0-9_-]{32,64}$/);
/** B9, public (no account): an open event by its link, and one's own registration by its personal link. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const r = q.get("r");
    return Response.json(await publicEvent(getDb(), token.parse(q.get("token")), r ? z.string().regex(/^[A-Za-z0-9_-]{30,64}$/).parse(r) : undefined), { headers: { ...noStore, "Referrer-Policy": "no-referrer" } });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const body = JSON.parse(new TextDecoder().decode(await bounded(request, 20000)));
    return Response.json(await publicExecute(getDb(), token.parse(body.token), publicCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
