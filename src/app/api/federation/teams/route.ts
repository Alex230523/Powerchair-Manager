import { getDb } from "@/lib/db";
import { federationTeamsView } from "@/domains/federation/clubs";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Wave 16 (I3): every affiliated club's teams this season, read only. */
export async function GET(request: Request) {
  try {
    return Response.json(await federationTeamsView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
