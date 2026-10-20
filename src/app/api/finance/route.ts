import { getDb } from "@/lib/db";
import {
  financeView,
  financeExecute,
  commandSchema,
} from "@/domains/finance/service";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(await financeView(getDb(), await principalIn(request, "finance")), {
      headers: noStore,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "finance"),
      body = JSON.parse(
        new TextDecoder().decode(await bounded(request, 10000)),
      );
    return Response.json(
      await financeExecute(
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
