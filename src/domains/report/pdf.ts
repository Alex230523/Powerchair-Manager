import { pdfDocument, type PdfLine } from "../../lib/pdf";
import type { Slide } from "./slides";

/**
 * Lot 5 (05/11/2026): the same report as a PDF, ready for the general
 * assembly: one section after the other, the figures as lines, the tables
 * as rows, without the photo frames meant for Canva.
 */
export function reportPdfLines(slides: Slide[], club: string, generated: string): PdfLine[] {
  const out: PdfLine[] = [];
  for (const [i, s] of slides.entries()) {
    out.push({ text: s.title, size: i === 0 ? 22 : 15, bold: true, gap: i === 0 ? 10 : 18 });
    if (s.subtitle) out.push({ text: s.subtitle, size: 11, gap: 6 });
    if (s.id === "cover") out.push({ text: club, size: 11, gap: 2 }, { text: generated, size: 9, gap: 8 });
    for (const n of s.numbers ?? []) out.push({ text: `${n.label} : ${n.value}${n.note ? ` (${n.note})` : ""}`, size: 10, gap: 3, indent: 8 });
    if (s.text) out.push({ text: s.text, size: 10, gap: 4 });
    for (const l of s.lines ?? []) out.push({ text: l, size: 10, gap: 3, indent: 8 });
    if (s.table) {
      out.push({ text: s.table.head.join("  |  "), size: 9, bold: true, gap: 3, indent: 8 });
      for (const r of s.table.rows) out.push({ text: r.join("  |  "), size: 9, gap: 2, indent: 8 });
    }
    for (const ch of s.charts ?? []) {
      out.push({ text: ch.title, size: 10, bold: true, gap: 3, indent: 8 });
      ch.labels.forEach((label, k) => out.push({ text: `${label} : ${ch.values[k] ?? ""}`, size: 9, gap: 2, indent: 16 }));
    }
  }
  return out;
}
export function reportPdf(slides: Slide[], club: string, title: string, generated: string) {
  return pdfDocument(reportPdfLines(slides, club, generated), title, { footer: [{ text: `${club} · ${title}`, size: 8 }] });
}
