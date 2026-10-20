import { getDb } from "@/lib/db";
import {
  calendarExecute,
  calendarCopyWeek,
  calendarView,
  commandSchema,
} from "@/domains/calendar/service";
import { rangeSchema } from "@/domains/calendar/schema";
import {
  principal,
  origin,
  bounded,
  noStore,
  failure,
} from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await calendarView(
        getDb(),
        await principal(request),
        rangeSchema.parse(
          Object.fromEntries(new URL(request.url).searchParams),
        ),
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(
        new TextDecoder().decode(await bounded(request, 65000)),
      );
    const command = commandSchema.parse(body),
      org = z.uuid().parse(body.organizationId);
    return Response.json(
      command.action === "copyWeek"
        ? await calendarCopyWeek(getDb(), p, command, org)
        : await calendarExecute(getDb(), p, command, org),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
