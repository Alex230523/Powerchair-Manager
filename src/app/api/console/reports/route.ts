import { getDb } from "@/lib/db";
import { reportGenerate, reportPdf, reportsView } from "@/domains/console/metrics";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Console, series A (06/11/2026): the monthly reports, listed, downloaded, or generated again. */
export async function GET(request: Request) {
  try {
    const p = await principal(request),
      id = new URL(request.url).searchParams.get("id");
    if (id) {
      const r = await reportPdf(getDb(), p, z.uuid().parse(id));
      return new Response(new Uint8Array(r.pdf), { headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="rapport-${r.month.slice(0, 7)}.pdf"` } });
    }
    return Response.json(await reportsView(getDb(), p), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 1000)));
    return Response.json(await reportGenerate(getDb(), p, z.string().regex(/^\d{4}-\d{2}-01$/).parse(body.month)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
