import { z } from "zod";
import { getDb } from "@/lib/db";
import { setupCommand } from "@/domains/setup/schema";
import { setupExecute, setupView } from "@/domains/setup/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** Getting started of a new club (wave 15, C3): the steps, and hiding the card. */
export async function GET(request: Request) {
  try {
    return Response.json(await setupView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 2000)));
    const cmd = setupCommand.parse(body);
    return Response.json(await setupExecute(getDb(), p, cmd.hidden, z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
