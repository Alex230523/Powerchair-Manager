import { getDb } from "@/lib/db";
import { incidentFile } from "@/domains/incidents/service";
import { principal, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** B5: a photo (health rights) or an insurance paper (managers). */
export async function GET(request: Request) {
  try {
    const f = await incidentFile(getDb(), await principal(request), z.uuid().parse(new URL(request.url).searchParams.get("id")));
    return new Response(new Uint8Array(f.bytes), {
      headers: { ...noStore, "Content-Type": f.type, "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(f.name), "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" },
    });
  } catch (e) {
    return failure(e);
  }
}
