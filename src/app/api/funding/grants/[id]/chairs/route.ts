import { z } from "zod";
import { getDb } from "@/lib/db";
import { grantChairsExport } from "@/domains/funding/service";
import { principalIn, failure } from "@/lib/http";
import { xlsx } from "@/lib/xlsx";
export const dynamic = "force-dynamic";
/** Spreadsheet of the chairs a grant financed (wave 15, C2), for the report to the funder. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id);
    const locale = z.enum(["fr", "nl", "en"]).catch("fr").parse(new URL(request.url).searchParams.get("locale"));
    const { rows, name } = await grantChairsExport(getDb(), await principalIn(request, "finance"), id, locale);
    const file = (name.normalize("NFD").replace(/[^\w -]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "subside") + "-equipement";
    return new Response(xlsx(rows, name.slice(0, 31)) as BodyInit, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${file}.xlsx"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
