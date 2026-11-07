import { getDb } from "@/lib/db";
import { privacyExport } from "@/domains/privacy/service";
import { noStore, failure, principalCounted } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** GDPR right of access: a JSON file with everything the club holds on one person. */
export async function GET(request: Request) {
  try {
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const data = await privacyExport(getDb(), await principalCounted(request, "user-export"), id);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        ...noStore,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="donnees-${id.slice(0, 8)}.json"`,
      },
    });
  } catch (e) {
    return failure(e);
  }
}
