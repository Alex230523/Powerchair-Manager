import { getDb } from "@/lib/db";
import { guidePublic } from "@/domains/guide/service";
import { noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** A chapter the federation opened to everyone (discovery days, new parents): no account needed. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    return Response.json(await guidePublic(getDb(), z.uuid().parse(q.get("federation")), z.string().regex(/^[a-z0-9-]{2,40}$/).parse(q.get("slug"))), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
