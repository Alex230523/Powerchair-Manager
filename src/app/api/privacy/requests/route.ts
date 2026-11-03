import { getDb } from "@/lib/db";
import { dataRequestCreate, myDataRequests } from "@/domains/legal/service";
import { dataRequestCommand } from "@/domains/legal/schema";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** 21: a person's requests (access, rectification, erasure), sent to the club responsible. */
export async function GET(request: Request) {
  try {
    return Response.json(await myDataRequests(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 10000)));
    return Response.json(await dataRequestCreate(getDb(), p, dataRequestCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
