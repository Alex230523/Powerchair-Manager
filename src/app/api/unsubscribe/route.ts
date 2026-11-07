import { throttle } from "@/lib/rate-limit";
import { getDb } from "@/lib/db";
import {
  unsubscribeInfo,
  unsubscribeExecute,
} from "@/domains/communication/service";
import { digestUnsubscribe, digestUnsubscribeInfo } from "@/domains/digest/service";
import { AccessError } from "@/domains/access/service";
import { origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/**
 * Public: the private link received in a newsletter or at the bottom of a
 * weekly digest (wave 15, C7) is the only key.
 */
async function info(id: string) {
  const digest = await digestUnsubscribeInfo(getDb(), id);
  if (digest) return { ...digest, kind: "digest" as const };
  return { ...(await unsubscribeInfo(getDb(), id)), kind: "news" as const };
}
async function execute(id: string, stop: boolean) {
  const digest = await digestUnsubscribe(getDb(), id, stop);
  if (digest) return digest;
  if (await digestUnsubscribeInfo(getDb(), id)) throw new AccessError("NOT_FOUND", 404);
  return unsubscribeExecute(getDb(), id, stop);
}
export async function GET(request: Request) {
  try {
    await throttle(getDb(), request, "public-read");
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    return Response.json(await info(id), {
      headers: noStore,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    await throttle(getDb(), request, "public-write");
    origin(request);
    const body = z
      .object({ id: z.uuid(), stop: z.boolean() })
      .parse(JSON.parse(new TextDecoder().decode(await bounded(request, 2000))));
    return Response.json(await execute(body.id, body.stop), {
      headers: noStore,
    });
  } catch (e) {
    return failure(e);
  }
}
