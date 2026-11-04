import { getDb } from "@/lib/db";
import { forecastExecute, forecastPdf, forecastView } from "@/domains/finance/forecast";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
import { isLocale } from "@/lib/locale";
export const dynamic = "force-dynamic";

/** H4: the 12-month forecast (?format=pdf the paper for the board or a loan); POST a simulation line or the threshold. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const p = await principalIn(request, "finance");
    if (q.get("format") === "pdf") {
      const l = q.get("locale") ?? "fr";
      const bytes = await forecastPdf(getDb(), p, isLocale(l) ? l : "fr");
      return new Response(Buffer.from(bytes), { headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="previsions-tresorerie.pdf"' } });
    }
    return Response.json(await forecastView(getDb(), p), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "finance"),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 5000)));
    return Response.json(await forecastExecute(getDb(), p, body, body.organizationId), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
