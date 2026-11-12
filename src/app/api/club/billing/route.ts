import { getDb } from "@/lib/db";
import { clubDiscount, organizationBilling } from "@/domains/billing/service";
import { ublForOrganization } from "@/domains/billing/ubl";
import { z } from "zod";
import { principal, principalCounted, origin, bounded, noStore, failure } from "@/lib/http";
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
/** 12/11/2026: the president of a club without a federation adds the discount code the platform gave him. */
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalCounted(request, "user-code"),
      body = z.object({ action: z.literal("code"), code: z.string().max(40) }).parse(JSON.parse(new TextDecoder().decode(await bounded(request, 1000))));
    return Response.json(await clubDiscount(getDb(), p, body.code), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
