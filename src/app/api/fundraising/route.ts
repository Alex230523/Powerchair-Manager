import { getDb } from "@/lib/db";
import {
  fundraisingView,
  fundraisingExecute,
  fundraisingCommand,
} from "@/domains/fundraising/service";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await fundraisingView(getDb(), await principalIn(request, "fundraising")),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "fundraising"),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 20000)));
    return Response.json(
      await fundraisingExecute(
        getDb(),
        p,
        fundraisingCommand.parse(body),
        z.uuid().parse(body.organizationId),
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
