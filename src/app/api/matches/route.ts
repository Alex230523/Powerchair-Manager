import { getDb } from "@/lib/db";
import {
  matchesView,
  matchDetail,
  matchExecute,
  clubCommand,
} from "@/domains/competitions/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    const p = await principal(request);
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
    const p = await principal(request),
      body = JSON.parse(
        new TextDecoder().decode(await bounded(request, 30000)),
      );
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
