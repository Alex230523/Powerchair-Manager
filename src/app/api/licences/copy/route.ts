import { getDb } from "@/lib/db";
import { licenceCopy } from "@/domains/licences/service";
import { principal, noStore, failure, servedType } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** The copy of a licence, sandboxed. */
export async function GET(request: Request) {
  try {
    const f = await licenceCopy(getDb(), await principal(request), z.uuid().parse(new URL(request.url).searchParams.get("profile")));
    return new Response(new Uint8Array(f.content), {
      headers: {
        ...noStore,
        "Content-Type": servedType(f.media_type),
        "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(f.filename),
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
