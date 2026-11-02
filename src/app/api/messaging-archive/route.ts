import { getDb } from "@/lib/db";
import { messagingArchive } from "@/domains/messaging-archive/service";
import { isLocale } from "@/lib/locale";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** 24: the club's old exchanges as a PDF, for its president, until the tables go. */
export async function GET(request: Request) {
  try {
    const asked = new URL(request.url).searchParams.get("locale") ?? "fr";
    const { bytes, filename } = await messagingArchive(getDb(), await principal(request), isLocale(asked) ? asked : "fr");
    return new Response(new Uint8Array(bytes), {
      headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
    });
  } catch (e) {
    return failure(e);
  }
}
