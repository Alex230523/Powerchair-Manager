import { getDb } from "@/lib/db";
import {
  matchesView,
  matchDetail,
  matchExecute,
  clubCommand,
  friendlyCommand,
  friendlyMatchExecute,
} from "@/domains/competitions/service";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    const p = await principalIn(request, "matches");
    return Response.json(
      id
        ? await matchDetail(getDb(), p, z.uuid().parse(id))
        : await matchesView(getDb(), p),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "matches"),
      body = JSON.parse(
        new TextDecoder().decode(await bounded(request, 30000)),
      );
    // Wave 17 (C5): friendlies between clubs, invitations, scores and transport.
    if (["friendly", "answerInvitation", "cancelInvitation", "confirmScore", "organizeTransport"].includes(body?.action))
      return Response.json(await friendlyMatchExecute(getDb(), p, friendlyCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
    return Response.json(
      await matchExecute(
        getDb(),
        p,
        clubCommand.parse(body),
        z.uuid().parse(body.organizationId),
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
