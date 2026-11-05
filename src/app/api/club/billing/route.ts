import { getDb } from "@/lib/db";
import { organizationBilling } from "@/domains/billing/service";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Console, step 4 (05/11/2026): the organisation's own subscription and invoices, for its presidency. */
export async function GET(request: Request) {
  try {
    return Response.json(await organizationBilling(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
