import { getDb } from "@/lib/db";
import {
  unsubscribeInfo,
  unsubscribeExecute,
} from "@/domains/communication/service";
import { origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** Public: the private link received in a newsletter is the only key. */
export async function GET(request: Request) {
  try {
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    return Response.json(await unsubscribeInfo(getDb(), id), {
      headers: noStore,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const body = z
      .object({ id: z.uuid(), stop: z.boolean() })
      .parse(JSON.parse(new TextDecoder().decode(await bounded(request, 2000))));
    return Response.json(await unsubscribeExecute(getDb(), body.id, body.stop), {
      headers: noStore,
    });
  } catch (e) {
    return failure(e);
  }
}
