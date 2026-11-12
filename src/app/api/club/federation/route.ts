import { getDb } from "@/lib/db";
import { clubFederationView } from "@/domains/federation-page/service";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** 12/11/2026: the « Fédération » page of a club: circulars, tournaments, transfers, discipline, the affiliated clubs. */
export async function GET(request: Request) {
  try {
    return Response.json(await clubFederationView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
