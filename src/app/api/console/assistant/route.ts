import { getDb } from "@/lib/db";
import { assistantInput, assistantTurn, assistantView } from "@/domains/assistant/service";
import { principal, origin, bounded, noStore, failure, principalCounted } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Console, step 7 (06/11/2026): the assistant in the console, as the operator signed in. */
export async function GET(request: Request) {
  try {
    return Response.json(await assistantView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalCounted(request, "operator-assistant"),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 400000)));
    return Response.json(await assistantTurn(getDb(), p, assistantInput.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
