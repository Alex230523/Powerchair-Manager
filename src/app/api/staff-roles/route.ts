import { getDb } from "@/lib/db";
import { staffRolesExecute, staffRolesView } from "@/domains/access/staff-roles";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** 7: the club's staff roles (models of rights) and who has them; who manages the mandates changes them. */
export async function GET(request: Request) {
  try {
    return Response.json(await staffRolesView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 20000)));
    return Response.json(await staffRolesExecute(getDb(), p, body, z.uuid().parse(body?.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
