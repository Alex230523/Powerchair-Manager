import { getDb } from "@/lib/db";
import {
  guestRequestSchema,
  requestGuestLink,
} from "@/domains/registrations/guest";
import { origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** Public: emails a personal registration link (same answer whatever the address). */
export async function POST(request: Request) {
  try {
    origin(request);
    const body = JSON.parse(
      new TextDecoder().decode(await bounded(request, 4000)),
    );
    return Response.json(
      await requestGuestLink(getDb(), guestRequestSchema.parse(body)),
      {
        headers: noStore,
      },
    );
  } catch (e) {
    return failure(e);
  }
}
