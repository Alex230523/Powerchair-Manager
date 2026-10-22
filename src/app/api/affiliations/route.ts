import { getDb } from "@/lib/db";
import { clubAffiliationsView, clubAffiliationsExecute } from "@/domains/affiliations/service";
import { clubAffiliationCommand } from "@/domains/affiliations/schema";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Wave 17 (N2): the club's affiliations and federal fees. */
export async function GET(request: Request) {
  try {
    return Response.json(await clubAffiliationsView(getDb(), await principalIn(request, "finance")), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
/** Add or archive a fee of the club, mark a due « en ordre ». */
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "finance"),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 10000)));
    return Response.json(await clubAffiliationsExecute(getDb(), p, clubAffiliationCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
