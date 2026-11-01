import { getDb } from "@/lib/db";
import { createPushSender, pushCommand, pushExecute, pushView } from "@/domains/notifications/push";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** B4: the person's devices and phone topics (per club), and the platform's public VAPID key. */
export async function GET(request: Request) {
  try {
    return Response.json(await pushView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request);
    const body = JSON.parse(new TextDecoder().decode(await bounded(request, 5000)));
    return Response.json(await pushExecute(getDb(), p, pushCommand.parse(body), createPushSender()), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
