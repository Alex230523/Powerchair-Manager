import { getDb } from "@/lib/db";
import { federationRefereesView } from "@/domains/federation/clubs";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Wave 16 (I3): referees of the federation and pending invitations (actions go to /api/federation/clubs). */
export async function GET(request: Request) {
  try {
    return Response.json(await federationRefereesView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
