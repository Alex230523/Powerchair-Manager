import { getDb } from "@/lib/db";
import { attestationFile } from "@/domains/dues/attestation-send";
import { principalIn, noStore, failure } from "@/lib/http";
import { isLocale } from "@/lib/locale";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** 9: the attestation as a PDF (?profile=&season=&locale=), shown in the page or downloaded (&download=1). */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const l = q.get("locale") ?? "fr";
    const f = await attestationFile(getDb(), await principalIn(request, "dues"), z.uuid().parse(q.get("profile")), z.uuid().parse(q.get("season")), isLocale(l) ? l : "fr");
    return new Response(Buffer.from(f.bytes), {
      headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": `${q.get("download") === "1" ? "attachment" : "inline"}; filename="${f.filename}"`, "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    return failure(e);
  }
}
