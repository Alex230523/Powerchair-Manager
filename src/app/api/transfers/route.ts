import { getDb } from "@/lib/db";
import { sheetView, transferCommand, transferExecute, transfersView } from "@/domains/transfers/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Wave 17 (J3): the transfer market; ?person= gives a visible player's sporting sheet. */
export async function GET(request: Request) {
  try {
    const person = new URL(request.url).searchParams.get("person");
    const p = await principal(request);
    return Response.json(person ? await sheetView(getDb(), p, z.uuid().parse(person)) : await transfersView(getDb(), p), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request);
    const body = JSON.parse(new TextDecoder().decode(await bounded(request, 16000)));
    return Response.json(await transferExecute(getDb(), p, transferCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
