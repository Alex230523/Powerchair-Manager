import { getDb } from "@/lib/db";
import { clubView, clubExecute, commandSchema } from "@/domains/club/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(await clubView(getDb(), await principal(request)), {
      headers: noStore,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(
        new TextDecoder().decode(await bounded(request, 760000)),
      );
    return Response.json(
      await clubExecute(
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
