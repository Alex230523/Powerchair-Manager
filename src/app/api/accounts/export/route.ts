import { limit } from "@/lib/rate-limit";
import { securityEvent } from "@/domains/security/events";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { accountsLedger, accountsView } from "@/domains/accounts/service";
import { accountsSheet } from "@/domains/accounts/export";
import { accountsCopy } from "@/components/accounts-copy";
import { principalIn, failure } from "@/lib/http";
import { xlsx } from "@/lib/xlsx";
export const dynamic = "force-dynamic";
/** The annual accounts as a spreadsheet for the accountant (wave 15, C12), with the ledger of the year. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const year = z.iso.date().parse(params.get("year"));
    const locale = z.enum(["fr", "nl", "en"]).catch("fr").parse(params.get("locale"));
    const p = await principalIn(request, "finance");
    // Security (07/11/2026): a whole file built on demand counts.
    await limit(getDb(), "user-export", p.userId);
    await securityEvent(getDb(), "data.export", { actorId: p.userId, details: { path: "/api/accounts/export" } });
    const view = await accountsView(getDb(), p, year);
    const ledger = await accountsLedger(getDb(), p, view.year.from);
    return new Response(xlsx(accountsSheet(view, ledger, accountsCopy[locale]), accountsCopy[locale].title) as BodyInit, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="comptes-${view.year.label}.xlsx"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
