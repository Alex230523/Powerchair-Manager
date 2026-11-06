import { getDb } from "@/lib/db";
import { billingCommand, billingExecute, billingView } from "@/domains/billing/service";
import { ublForOperator } from "@/domains/billing/ubl";
import { z } from "zod";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Console, step 4 (05/11/2026): the platform's subscriptions, invoices and reminders (owner and finance). */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const p = await principal(request);
    const ubl = url.searchParams.get("ubl");
    if (ubl) {
      const r = await ublForOperator(getDb(), p, z.uuid().parse(ubl));
      return new Response(r.xml, { headers: { ...noStore, "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${r.number}.xml"` } });
    }
    return Response.json(await billingView(getDb(), p, { state: url.searchParams.get("state") ?? "", organization: url.searchParams.get("organization") ?? "", country: url.searchParams.get("country") ?? "" }), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 8000)));
    return Response.json(await billingExecute(getDb(), p, billingCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
