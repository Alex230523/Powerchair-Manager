import { getDb } from "@/lib/db";
import {
  attendanceExecute,
  attendanceView,
  commandSchema,
} from "@/domains/attendance/service";
import {
  principal,
  origin,
  bounded,
  noStore,
  failure,
} from "@/lib/http";
import { rangeSchema } from "@/domains/calendar/schema";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const q = rangeSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return Response.json(
      await attendanceView(
        getDb(),
        await principal(request),
        q.from,
        q.to,
        q.team,
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
      await attendanceExecute(
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
