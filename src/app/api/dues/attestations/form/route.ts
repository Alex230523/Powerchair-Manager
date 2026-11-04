import { getDb } from "@/lib/db";
import { mutualFile } from "@/domains/dues/attestation-send";
import { principalIn, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** 9: a mutual's form (?id=&which=blank|filled), for the club's money or the member's family. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const f = await mutualFile(getDb(), await principalIn(request, "dues"), z.uuid().parse(q.get("id")), q.get("which") === "filled" ? "filled" : "blank");
    const name = f.name.replace(/[^\w.-]+/g, "_");
    return new Response(Buffer.from(f.bytes), { headers: { ...noStore, "Content-Type": f.type, "Content-Disposition": `attachment; filename="${name}"`, "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    return failure(e);
  }
}
