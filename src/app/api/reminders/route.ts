import { getDb } from "@/lib/db";
import {
  remindersView,
  remindersExecute,
  commandSchema,
} from "@/domains/reminders/service";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await remindersView(getDb(), await principalIn(request, "reminders")),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "reminders"),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 8000)));
    return Response.json(
      await remindersExecute(
        getDb(),
        p,
        commandSchema.parse(body),
        z.uuid().parse(body.organizationId),
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
