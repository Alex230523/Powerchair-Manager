import { getDb } from "@/lib/db";
import { publicForm } from "@/domains/registrations/service";
import { noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(await publicForm(getDb(), (await params).id), {
      headers: noStore,
    });
  } catch (e) {
    return failure(e);
  }
}
