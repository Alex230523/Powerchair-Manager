import { getDb } from "@/lib/db";
import { apiTeams } from "@/domains/integrations/api";
import { apiV1 } from "@/lib/api-v1";
export const dynamic = "force-dynamic";
/** B6, API v1 (scope read:teams). */
export async function GET(request: Request) {
  return apiV1(request, "read:teams", (org) => apiTeams(getDb(), org));
}
