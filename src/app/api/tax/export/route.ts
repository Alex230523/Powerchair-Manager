import { getDb } from "@/lib/db";
import { belcotaxExport } from "@/domains/tax/service";
import { noStore, failure, principalCounted } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** B8: the Belcotax-on-Web file of a year (?check=1: only the problems found). */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const year = z.coerce.number().int().min(2000).max(2100).parse(q.get("year"));
    const p = await principalCounted(request, "user-export");
    if (q.get("check") === "1") return Response.json(await belcotaxExport(getDb(), p, year, true), { headers: noStore });
    const out = (await belcotaxExport(getDb(), p, year)) as { name: string; xml: string };
    return new Response(out.xml, {
      headers: { ...noStore, "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(out.name), "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    return failure(e);
  }
}
