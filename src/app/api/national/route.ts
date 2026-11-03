import { getDb } from "@/lib/db";
import { nationalCommand, nationalExecute, nationalView } from "@/domains/national/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** 6: the federation's national teams (competitions competence). */
export async function GET(request: Request) {
  try {
    return Response.json(await nationalView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 40000)));
    return Response.json(await nationalExecute(getDb(), p, nationalCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
