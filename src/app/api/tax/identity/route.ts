import { getDb } from "@/lib/db";
import { identityRequestInfo, identityRequestSubmit } from "@/domains/tax/service";
import { origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** B8, public: the donor's secure form for their national number; the private link is the only key. */
const token = z.string().regex(/^[A-Za-z0-9_-]{40,60}$/);
export async function GET(request: Request) {
  try {
    return Response.json(await identityRequestInfo(getDb(), token.parse(new URL(request.url).searchParams.get("token"))), { headers: { ...noStore, "Referrer-Policy": "no-referrer" } });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const body = z.object({ token, value: z.string().max(20) }).parse(JSON.parse(new TextDecoder().decode(await bounded(request, 2000))));
    return Response.json(await identityRequestSubmit(getDb(), body.token, body.value), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
