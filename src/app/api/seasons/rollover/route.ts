import { getDb } from "@/lib/db";
import {
  rolloverView,
  rolloverExecute,
  rolloverCommand,
} from "@/domains/seasons/rollover";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const from = new URL(request.url).searchParams.get("from");
    return Response.json(
      await rolloverView(getDb(), await principal(request), from ? z.uuid().parse(from) : undefined),
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
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 200000)));
    return Response.json(
      await rolloverExecute(
        getDb(),
        p,
        rolloverCommand.parse(body),
        z.uuid().parse(body.organizationId),
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
