import { getDb } from "@/lib/db";
import { grantAttachment } from "@/domains/report/impact";
import { principal, noStore, failure, disposition } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** H13: a report filed with a grant (?id=), for those who manage the money. */
export async function GET(request: Request) {
  try {
    const f = await grantAttachment(getDb(), await principal(request), z.uuid().parse(new URL(request.url).searchParams.get("id")));
    return new Response(Buffer.from(f.bytes), { headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": disposition("attachment", f.filename), "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    return failure(e);
  }
}
