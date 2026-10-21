import { getDb } from "@/lib/db";
import { teamsView, teamDetail, teamsExecute, teamsCommand } from "@/domains/teams/service";
import { parseScope } from "@/domains/scope/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** Team cards of the chosen season, or one team sheet with ?id= (wave 12). */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const id = q.get("id");
    const p = await principal(request);
    return Response.json(id ? await teamDetail(getDb(), p, z.uuid().parse(id)) : await teamsView(getDb(), p, parseScope(q)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 20000)));
    return Response.json(await teamsExecute(getDb(), p, teamsCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
