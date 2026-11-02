import { getDb } from "@/lib/db";
import { impactExecute, impactPdf, impactView, impactXlsx } from "@/domains/report/impact";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
import { isLocale } from "@/lib/locale";
export const dynamic = "force-dynamic";

/** H13: the impact report of a period (?from=&to=&grant=), as JSON, PDF (&format=pdf) or Excel (&format=xlsx); POST settings, adjustments, filing. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const p = await principalIn(request, "statistics");
    const raw = { from: q.get("from") ?? undefined, to: q.get("to") ?? undefined, grant: q.get("grant") ?? undefined };
    const l = q.get("locale") ?? "fr";
    const locale = isLocale(l) ? l : "fr";
    if (q.get("format") === "pdf")
      return new Response(Buffer.from(await impactPdf(getDb(), p, locale, raw)), { headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="rapport-impact.pdf"' } });
    if (q.get("format") === "xlsx")
      return new Response(Buffer.from(await impactXlsx(getDb(), p, locale, raw)), {
        headers: { ...noStore, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="rapport-impact.xlsx"' },
      });
    return Response.json(await impactView(getDb(), p, raw), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "statistics"),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 10000)));
    return Response.json(await impactExecute(getDb(), p, body, body?.organizationId), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
