import { getDb } from "@/lib/db";
import {
  refereeView,
  refereeExecute,
  refereeCommand,
} from "@/domains/competitions/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(await refereeView(getDb(), await principal(request)), {
      headers: noStore,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(
        new TextDecoder().decode(await bounded(request, 30000)),
      );
    return Response.json(
      await refereeExecute(
        getDb(),
        p,
        refereeCommand.parse(body),
        z.uuid().parse(body.organizationId),
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
