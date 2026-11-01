import { getDb } from "@/lib/db";
import { matchSheet } from "@/domains/competitions/journey";
import { matchSheetPdf } from "@/domains/competitions/match-sheet";
import { principalIn, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** A5: the printable match sheet, as a PDF. */
export async function GET(request: Request) {
  try {
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const s = await matchSheet(getDb(), await principalIn(request, "matches"), id);
    const bytes = matchSheetPdf({ ...s, match: { ...s.match, starts_at: new Date(s.match.starts_at).toISOString() } });
    return new Response(new Uint8Array(bytes), {
      headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(`feuille-de-match-${id.slice(0, 8)}.pdf`), "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    return failure(e);
  }
}
