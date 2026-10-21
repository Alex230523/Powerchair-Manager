import { getDb } from "@/lib/db";
import { programPrint } from "@/domains/exercises/service";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Wave 16 (E2): every sheet of a training, to print the programme. */
export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    return Response.json(await programPrint(getDb(), await principal(request), (await params).eventId), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
