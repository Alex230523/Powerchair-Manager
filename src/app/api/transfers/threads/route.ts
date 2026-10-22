import { getDb } from "@/lib/db";
import { threadsView } from "@/domains/transfers/service";
import { principal, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Wave 17 (J3): the conversations between the two clubs of each transfer offer. */
export async function GET(request: Request) {
  try {
    const offer = new URL(request.url).searchParams.get("offer");
    return Response.json(await threadsView(getDb(), await principal(request), offer ? z.uuid().parse(offer) : undefined), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
