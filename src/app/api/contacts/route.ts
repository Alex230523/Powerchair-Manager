import { getDb } from "@/lib/db";
import { contactsView, contactsExecute } from "@/domains/funding/service";
import { contactCommand } from "@/domains/funding/schema";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(await contactsView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 20000)));
    return Response.json(
      await contactsExecute(getDb(), p, contactCommand.parse(body), z.uuid().parse(body.organizationId)),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
