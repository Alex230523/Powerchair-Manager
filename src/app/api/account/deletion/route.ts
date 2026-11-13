import { getDb } from "@/lib/db";
import { deletionExecute, deletionView } from "@/domains/account/deletion";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** 12/11/2026: deleting one's account, after 30 days that can be cancelled. */
export async function GET(request: Request) {
  try {
    return Response.json(await deletionView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 2000)));
    return Response.json(await deletionExecute(getDb(), p, body), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
