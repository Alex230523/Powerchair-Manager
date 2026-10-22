import { getDb } from "@/lib/db";
import { requestProof } from "@/domains/coaches/service";
import { principal, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Wave 17 (O1): the certificate a club sent with a course request, sandboxed. */
export async function GET(request: Request) {
  try {
    const f = await requestProof(getDb(), await principal(request), z.uuid().parse(new URL(request.url).searchParams.get("id")));
    return new Response(new Uint8Array(f.content), {
      headers: {
        ...noStore,
        "Content-Type": f.media_type,
        "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(f.filename),
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
