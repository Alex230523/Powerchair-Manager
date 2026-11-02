import { getDb } from "@/lib/db";
import { myTaskCount, tasksExecute, tasksView } from "@/domains/tasks/service";
import { taskCommand } from "@/domains/tasks/schema";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Wave 17 (O1): the club's tasks, by type; `?count=mine` (22): how many are mine, open and late. */
export async function GET(request: Request) {
  try {
    const p = await principal(request);
    if (new URL(request.url).searchParams.get("count") === "mine") return Response.json(await myTaskCount(getDb(), p), { headers: noStore });
    return Response.json(await tasksView(getDb(), p), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 40000)));
    return Response.json(await tasksExecute(getDb(), p, taskCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
