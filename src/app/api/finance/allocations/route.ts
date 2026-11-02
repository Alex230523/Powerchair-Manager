import { getDb } from "@/lib/db";
import { allocationsExecute, allocationsExport, allocationsView } from "@/domains/finance/allocations";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
import { isLocale } from "@/lib/locale";
export const dynamic = "force-dynamic";

/** 9: reserved funds. GET the allocations (?export=csv the justification file), POST create, update, close, link. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const p = await principalIn(request, "finance");
    if (q.get("export") === "csv") {
      const l = q.get("locale") ?? "fr";
      const grant = q.get("grant");
      const csv = await allocationsExport(getDb(), p, isLocale(l) ? l : "fr", grant && /^[0-9a-f-]{36}$/i.test(grant) ? grant : null);
      return new Response(csv, { headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="fonds-reserves.csv"' } });
    }
    return Response.json(await allocationsView(getDb(), p), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "finance"),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 10000)));
    return Response.json(await allocationsExecute(getDb(), p, body, body.organizationId), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
