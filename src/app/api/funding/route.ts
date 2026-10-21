import { getDb } from "@/lib/db";
import { fundingView, fundingExecute } from "@/domains/funding/service";
import { fundingCommand } from "@/domains/funding/schema";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** Grants and partners (wave 11), part of the finance module. */
export async function GET(request: Request) {
  try {
    return Response.json(await fundingView(getDb(), await principalIn(request, "finance")), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "finance"),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 30000)));
    return Response.json(
      await fundingExecute(getDb(), p, fundingCommand.parse(body), z.uuid().parse(body.organizationId)),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
