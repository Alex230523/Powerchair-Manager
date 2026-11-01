import { getDb } from "@/lib/db";
import { bankExecute, bankView } from "@/domains/bank/service";
import { bankCommand } from "@/domains/bank/schema";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** B1: the club's bank accounts, statement lines and their reconciliation (dues.read sees, dues.manage acts). */
export async function GET(request: Request) {
  try {
    return Response.json(await bankView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      // A statement of 5000 lines, parsed on the device, stays under 4 MB.
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 4_000_000)));
    return Response.json(await bankExecute(getDb(), p, bankCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
