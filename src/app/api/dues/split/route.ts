import { getDb } from "@/lib/db";
import { z } from "zod";
import { billingSplitCommand, billingSplitExecute, billingSplitView } from "@/domains/family/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** 29: who receives a child's dues and attestations (`?subject=` the child). */
export async function GET(request: Request) {
  try {
    const p = await principal(request);
    return Response.json(await billingSplitView(getDb(), p, z.uuid().parse(new URL(request.url).searchParams.get("subject"))), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 8000)));
    return Response.json(await billingSplitExecute(getDb(), p, billingSplitCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
