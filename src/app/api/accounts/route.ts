import { z } from "zod";
import { getDb } from "@/lib/db";
import { accountsExecute, accountsView } from "@/domains/accounts/service";
import { accountsCommand } from "@/domains/accounts/schema";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** Annual accounts (wave 15, C12), part of the finance module. */
export async function GET(request: Request) {
  try {
    const year = new URL(request.url).searchParams.get("year") ?? undefined;
    return Response.json(await accountsView(getDb(), await principalIn(request, "finance"), year), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "finance"),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 60000)));
    return Response.json(await accountsExecute(getDb(), p, accountsCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
