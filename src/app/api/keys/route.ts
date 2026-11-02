import { getDb } from "@/lib/db";
import { z } from "zod";
import { keyCommand, keysExecute, keysView } from "@/domains/keys/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** H10: the keys and badges of a person (`?profile=`). */
export async function GET(request: Request) {
  try {
    const p = await principal(request);
    return Response.json(await keysView(getDb(), p, z.uuid().parse(new URL(request.url).searchParams.get("profile"))), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 8000)));
    return Response.json(await keysExecute(getDb(), p, keyCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
