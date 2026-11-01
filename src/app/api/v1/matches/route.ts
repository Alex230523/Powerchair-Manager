import { getDb } from "@/lib/db";
import { apiMatches } from "@/domains/integrations/api";
import { apiV1 } from "@/lib/api-v1";
import { z } from "zod";
export const dynamic = "force-dynamic";
const day = z.iso.date().nullable();
/** B6, API v1 (scope read:matches): ?from=YYYY-MM-DD&to=YYYY-MM-DD. */
export async function GET(request: Request) {
  return apiV1(request, "read:matches", (org, q) => apiMatches(getDb(), org, day.parse(q.get("from")), day.parse(q.get("to"))));
}
