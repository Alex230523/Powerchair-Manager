import { getDb } from "@/lib/db";
import { registryCommand, registryExecute, registryView } from "@/domains/classification/registry";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** International, step 3 (06/11/2026): the federation's registry of classifications. */
export async function GET(request: Request) {
  try {
    return Response.json(await registryView(getDb(), await principal(request), new URL(request.url).searchParams.get("q") ?? ""), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 8000)));
    return Response.json(await registryExecute(getDb(), p, registryCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
