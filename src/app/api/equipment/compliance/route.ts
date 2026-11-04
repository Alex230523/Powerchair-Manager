import { getDb } from "@/lib/db";
import { complianceSave, complianceView } from "@/domains/equipment/compliance";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** « Conforme pour un match »: the last checks of a chair (?chair=), a new check recorded. */
export async function GET(request: Request) {
  try {
    const chair = z.uuid().parse(new URL(request.url).searchParams.get("chair"));
    return Response.json(await complianceView(getDb(), await principalIn(request, "equipment"), chair), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "equipment"),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 4000)));
    return Response.json(await complianceSave(getDb(), p, body, z.uuid().parse(body?.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
