import { getDb } from "@/lib/db";
import { exerciseDetail } from "@/domains/exercises/service";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Wave 16 (E2): one sheet and the trainings it was used in. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return Response.json(await exerciseDetail(getDb(), await principal(request), (await params).id), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
