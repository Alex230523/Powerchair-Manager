import { getDb } from "@/lib/db";
import { incidentPdf } from "@/domains/incidents/service";
import { principal, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** B5: the declaration prefilled for the insurer. */
export async function GET(request: Request) {
  try {
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const bytes = await incidentPdf(getDb(), await principal(request), id);
    return new Response(new Uint8Array(bytes), {
      headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(`declaration-${id.slice(0, 8)}.pdf`), "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    return failure(e);
  }
}
