import { getDb } from "@/lib/db";
import { classificationTextsView } from "@/domains/classification/service";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Wave 17 (J4): what PF1 and PF2 mean, in the words of the member's federation. */
export async function GET(request: Request) {
  try {
    return Response.json(await classificationTextsView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
