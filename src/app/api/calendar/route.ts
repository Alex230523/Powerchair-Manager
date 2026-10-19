import { getDb } from "@/lib/db";
import {
  calendarExecute,
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
    return Response.json(
      await calendarExecute(
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
