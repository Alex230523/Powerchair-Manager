import { parseScope } from "@/domains/scope/service";
import { getDb } from "@/lib/db";
import { financeReport } from "@/domains/finance/service";
import { principalIn, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  // Formula-looking cells are neutralised for spreadsheet software.
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return /[";\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
};
const euros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** Season report as JSON (printable page) or CSV for the accountant. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const report = await financeReport(
      getDb(),
      await principalIn(request, "finance"),
      url.searchParams.get("season") ?? "",
      parseScope(url.searchParams),
    );
    if (url.searchParams.get("format") !== "csv")
      return Response.json(report, { headers: noStore });
    const lines = [
      ["Club", report.club],
      ["Saison", report.season.label],
      ["Solde d'ouverture", euros(report.opening)],
      ["Recettes", euros(report.summary.income)],
      ["Dépenses", euros(report.summary.expenses)],
      ["Solde de clôture", euros(report.closing)],
      [],
      [
        "Date",
        "Libellé",
        "Sens",
        "Catégorie",
        "Moyen",
        "Tiers",
        "Référence",
        "Montant",
        "Justificatifs",
      ],
      ...report.entries.map((e) => [
        e.occurred_on,
        e.label,
        e.direction === "in" ? "Recette" : "Dépense",
        e.category,
        e.method,
        e.counterparty,
        e.reference,
        (e.direction === "in" ? "" : "-") + euros(e.amount_cents),
        e.receipts,
      ]),
    ];
    return new Response(
      "﻿" + lines.map((l) => l.map(csvCell).join(";")).join("\r\n"),
      {
        headers: {
          ...noStore,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="finances-${report.season.label}.csv"`,
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
