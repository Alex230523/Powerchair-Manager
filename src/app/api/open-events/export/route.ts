import { getDb } from "@/lib/db";
import { openEventExport } from "@/domains/open-events/service";
import { principal, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** B9: the registered people of an open event, as a spreadsheet. */
export async function GET(request: Request) {
  try {
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const bytes = await openEventExport(getDb(), await principal(request), id);
    return new Response(new Uint8Array(bytes), {
      headers: { ...noStore, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="inscrits-${id.slice(0, 8)}.xlsx"`, "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    return failure(e);
  }
}
