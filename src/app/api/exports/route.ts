import { getDb } from "@/lib/db";
import { exportFile } from "@/domains/exports/service";
import { exportInput } from "@/domains/exports/schema";
import { origin, bounded, noStore, failure, servedType, principalCounted } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Wave 17 (G2): an Excel or CSV file of the list the person sees. */
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalCounted(request, "user-export");
    const body = JSON.parse(new TextDecoder().decode(await bounded(request, 4_000_000)));
    const f = await exportFile(getDb(), p, exportInput.parse(body), z.uuid().parse(body.organizationId));
    return new Response(f.body as BodyInit, {
      headers: {
        ...noStore,
        "Content-Type": servedType(f.type),
        "Content-Disposition": `attachment; filename="${f.name}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
