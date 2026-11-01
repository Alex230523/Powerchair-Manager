import { pdfDocument, type PdfLine } from "../../lib/pdf";
import { typedXlsx } from "../../lib/xlsx";

/**
 * B3: the report of one chair for a grant file or an insurer: what it cost
 * to buy and to keep (by kind of intervention), its days out of service and
 * its log, as a spreadsheet or a PDF. Pure: the labels come from the copy.
 */
export type ChairReportData = {
  club: string;
  chair: { name: string; brand: string; model: string; serial_number: string; acquired_on: string | null; purchase_value_cents: number | null; warranty_until: string | null; grant: string | null; partner: string | null; pot: string | null };
  lines: { occurred_on: string; kind: string; diagnosis: string; parts: string; supplier: string; cost_cents: number | null; days_out: number; invoice: string | null }[];
  cost: { purchase: number; upkeep: number; total: number; daysOut: number; byKind: Record<string, number> };
};
export type ChairReportLabels = {
  pdfTitle: string;
  club: string;
  brand: string;
  serialNumber: string;
  acquired: string;
  warranty: string;
  fundedBy: string;
  purchase: string;
  upkeep: string;
  total: string;
  daysOutTotal: string;
  interventions: string;
  noInterventions: string;
  kinds: Record<string, string>;
  date: string;
  kind: string;
  diagnosis: string;
  parts: string;
  supplier: string;
  cost: string;
  daysOut: string;
  invoice: string;
};
const tag = (l: string) => (l === "en" ? "en-GB" : `${l}-BE`);
const euros = (locale: string, cents: number) => new Intl.NumberFormat(tag(locale), { style: "currency", currency: "EUR" }).format(cents / 100);
const day = (locale: string, d: string | null) => (d ? new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z")) : "");

export function chairReportXlsx(r: ChairReportData, t: ChairReportLabels) {
  return typedXlsx(
    [
      { header: t.date, type: "date" },
      { header: t.kind, type: "text" },
      { header: t.diagnosis, type: "text" },
      { header: t.parts, type: "text" },
      { header: t.supplier, type: "text" },
      { header: t.cost, type: "money" },
      { header: t.daysOut, type: "number" },
      { header: t.invoice, type: "text" },
    ],
    r.lines.map((l) => [l.occurred_on, t.kinds[l.kind] ?? l.kind, l.diagnosis, l.parts, l.supplier, l.cost_cents === null ? null : l.cost_cents / 100, l.days_out, l.invoice ?? ""]),
    r.chair.name,
  );
}

export function chairReportPdf(r: ChairReportData, t: ChairReportLabels, locale: string) {
  const c = r.chair;
  const funded = [c.grant, c.partner, c.pot].filter(Boolean).join(", ");
  const lines: PdfLine[] = [
    { text: t.pdfTitle.replace("{chair}", c.name), size: 16, bold: true },
    { text: `${t.club} : ${r.club}`, gap: 6 },
    ...(c.brand || c.model ? [{ text: `${t.brand} : ${[c.brand, c.model].filter(Boolean).join(" ")}` }] : []),
    ...(c.serial_number ? [{ text: `${t.serialNumber} : ${c.serial_number}` }] : []),
    ...(c.acquired_on ? [{ text: `${t.acquired} : ${day(locale, c.acquired_on)}` }] : []),
    ...(c.warranty_until ? [{ text: `${t.warranty} : ${day(locale, c.warranty_until)}` }] : []),
    ...(funded ? [{ text: `${t.fundedBy} : ${funded}` }] : []),
    { text: `${t.purchase} : ${euros(locale, r.cost.purchase)}`, gap: 8 },
    { text: `${t.upkeep} : ${euros(locale, r.cost.upkeep)}` },
    ...Object.entries(r.cost.byKind)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ text: `${t.kinds[k] ?? k} : ${euros(locale, v)}`, indent: 16 })),
    { text: `${t.total} : ${euros(locale, r.cost.total)}`, bold: true },
    { text: `${t.daysOutTotal} : ${r.cost.daysOut}` },
    { text: t.interventions, size: 13, bold: true, gap: 10 },
  ];
  if (!r.lines.length) lines.push({ text: t.noInterventions });
  for (const l of r.lines) {
    lines.push({ text: `${day(locale, l.occurred_on)} · ${t.kinds[l.kind] ?? l.kind}${l.cost_cents !== null ? ` · ${euros(locale, l.cost_cents)}` : ""}${l.days_out ? ` · ${t.daysOut} : ${l.days_out}` : ""}`, bold: true, gap: 4 });
    const detail = [l.diagnosis, l.parts, l.supplier ? `${t.supplier} : ${l.supplier}` : "", l.invoice ? `${t.invoice} : ${l.invoice}` : ""].filter(Boolean).join(" · ");
    if (detail) lines.push({ text: detail, indent: 12, size: 10 });
  }
  return pdfDocument(lines, t.pdfTitle.replace("{chair}", c.name));
}
