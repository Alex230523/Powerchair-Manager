import { getDb } from "@/lib/db";
import { supportExecute, supportView } from "@/domains/support/service";
import { supportCommand } from "@/domains/support/schema";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Console, series C (06/11/2026): a person's tickets to the platform's support; open, reply, close. */
export async function GET(request: Request) {
  try {
    return Response.json(await supportView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 20000)));
    return Response.json(await supportExecute(getDb(), p, supportCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
