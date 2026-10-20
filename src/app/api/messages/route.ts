import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  messageCommand,
  messagesView,
  messagesExecute,
} from "@/domains/messages/service";
import {
  principalIn,
  origin,
  bounded,
  noStore,
  failure,
} from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("thread");
    return Response.json(
      await messagesView(
        getDb(),
        await principalIn(request, "messages"),
        id ? z.uuid().parse(id) : undefined,
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
    const p = await principalIn(request, "messages");
    const body = JSON.parse(
      new TextDecoder().decode(await bounded(request, 30000)),
    );
    return Response.json(
      await messagesExecute(
        getDb(),
        p,
        messageCommand.parse(body),
        z.uuid().parse(body.organizationId),
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
