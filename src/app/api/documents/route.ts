import { getDb } from "@/lib/db";
import { parseScope } from "@/domains/scope/service";
import {
  documentView,
  documentExecute,
  commandSchema,
} from "@/domains/documents/service";
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
      await documentView(getDb(), await principal(request), parseScope(new URL(request.url).searchParams)),
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
        new TextDecoder().decode(await bounded(request, 40000)),
      );
    return Response.json(
      await documentExecute(
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
