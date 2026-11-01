import { getDb } from "@/lib/db";
import { tasksExecute, tasksView } from "@/domains/tasks/service";
import { taskCommand } from "@/domains/tasks/schema";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Wave 17 (O1): the club's tasks, by type. */
export async function GET(request: Request) {
  try {
    return Response.json(await tasksView(getDb(), await principal(request)), { headers: noStore });
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
