import { gate } from "@/lib/http";
import { getDb } from "@/lib/db";
import { openApi } from "@/domains/integrations/api";
export const dynamic = "force-dynamic";
/** B6: the OpenAPI description of the read API (public). */
export async function GET(request: Request) {
  const flood = await gate(request, "public-read");
  if (flood) return flood;
  return Response.json(openApi(process.env.BETTER_AUTH_URL ?? new URL(request.url).origin), { headers: { "Cache-Control": "public, max-age=3600" } });
}
