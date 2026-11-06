import { getDb } from "@/lib/db";
import { organizationBilling } from "@/domains/billing/service";
import { ublForOrganization } from "@/domains/billing/ubl";
import { z } from "zod";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Console, step 4 (05/11/2026): the organisation's own subscription and invoices, for its presidency. */
export async function GET(request: Request) {
  try {
    const p = await principal(request),
      ubl = new URL(request.url).searchParams.get("ubl");
    if (ubl) {
      const r = await ublForOrganization(getDb(), p, z.uuid().parse(ubl));
      return new Response(r.xml, { headers: { ...noStore, "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${r.number}.xml"` } });
    }
    return Response.json(await organizationBilling(getDb(), p), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
