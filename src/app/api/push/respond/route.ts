import { getDb } from "@/lib/db";
import { respondFromPush } from "@/domains/notifications/push-respond";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
const schema = z.object({ invitationId: z.uuid(), organizationId: z.uuid(), response: z.enum(["present", "absent"]) });
/** B4: « Présent » / « Absent » pressed in a notification (sent by the service worker, with the session cookie). */
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request);
    const body = schema.parse(JSON.parse(new TextDecoder().decode(await bounded(request, 1000))));
    return Response.json(await respondFromPush(getDb(), p, body.invitationId, body.organizationId, body.response), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
