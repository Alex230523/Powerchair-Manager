import { getDb } from "@/lib/db";
import { careFor } from "@/domains/incidents/service";
import { principal, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** B5: the care instructions of the people a reporter is about to declare for (each reading logged). */
export async function GET(request: Request) {
  try {
    const ids = z.array(z.uuid()).max(10).parse((new URL(request.url).searchParams.get("profiles") ?? "").split(",").filter(Boolean));
    return Response.json(await careFor(getDb(), await principal(request), ids), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
