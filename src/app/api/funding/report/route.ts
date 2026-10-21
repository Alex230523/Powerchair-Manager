import { getDb } from "@/lib/db";
import { partnerReport } from "@/domains/funding/service";
import { failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** Public report of a partner shared by its club: delivered conditions and proofs, never amounts. */
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("t") ?? "";
    return Response.json(await partnerReport(getDb(), token), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
