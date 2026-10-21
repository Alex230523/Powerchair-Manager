import { z } from "zod";
import { getDb } from "@/lib/db";
import { undoCommand, undoExecute } from "@/domains/undo/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** Undo of a reversible action by its author, within two minutes (wave 15, C10). */
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 2000)));
    return Response.json(await undoExecute(getDb(), p, undoCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
