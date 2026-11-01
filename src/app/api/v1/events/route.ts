import { getDb } from "@/lib/db";
import { apiEvents } from "@/domains/integrations/api";
import { apiV1 } from "@/lib/api-v1";
export const dynamic = "force-dynamic";
/** B6, API v1 (scope read:events). */
export async function GET(request: Request) {
  return apiV1(request, "read:events", (org) => apiEvents(getDb(), org, process.env.BETTER_AUTH_URL ?? new URL(request.url).origin));
}
