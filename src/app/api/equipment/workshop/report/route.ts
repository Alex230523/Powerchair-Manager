import { getDb } from "@/lib/db";
import { chairReport } from "@/domains/equipment/workshop";
import { chairReportPdf, chairReportXlsx } from "@/domains/equipment/chair-report";
import { workshopCopy } from "@/components/workshop-copy";
import { principalIn, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** B3: one chair's report (cost of ownership, days out, log) as .xlsx or PDF. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const chair = z.uuid().parse(q.get("chair"));
    const format = z.enum(["xlsx", "pdf"]).parse(q.get("format") ?? "pdf");
    const r = await chairReport(getDb(), await principalIn(request, "equipment"), chair);
    const t = workshopCopy[r.locale];
    const name = `${r.chair.name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "fauteuil"}.${format}`;
    const bytes = format === "pdf" ? chairReportPdf(r, t, r.locale) : chairReportXlsx(r, t);
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...noStore,
        "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `${format === "pdf" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
