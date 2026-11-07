import { getDb } from "@/lib/db";
import { publicForm } from "@/domains/registrations/service";
import { noStore, failure, gate } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const flood = await gate(request, "public-read");
  if (flood) return flood;
  try {
    return Response.json(await publicForm(getDb(), (await params).id), {
      headers: noStore,
    });
  } catch (e) {
    return failure(e);
  }
}
