import { z } from "zod";
import { getDb } from "@/lib/db";
import { consoleSupport, consoleTicket, supportOperatorExecute } from "@/domains/support/service";
import { supportOperatorCommand } from "@/domains/support/schema";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Console, series C (06/11/2026): the support desk and the GDPR requests, for the operators. */
export async function GET(request: Request) {
  try {
    const p = await principal(request),
      url = new URL(request.url),
      ticket = url.searchParams.get("ticket");
    if (ticket) return Response.json(await consoleTicket(getDb(), p, z.uuid().parse(ticket)), { headers: noStore });
    return Response.json(await consoleSupport(getDb(), p, { state: url.searchParams.get("state") ?? "", q: url.searchParams.get("q") ?? "" }), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 20000)));
    return Response.json(await supportOperatorExecute(getDb(), p, supportOperatorCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
