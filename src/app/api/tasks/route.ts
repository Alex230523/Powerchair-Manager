import { getDb } from "@/lib/db";
import { myTaskCount, tasksExecute, tasksView, tasksYear } from "@/domains/tasks/service";
import { yearPdfCopy } from "@/domains/tasks/year-copy";
import { todoCopy } from "@/components/todo-copy";
import { pdfDocument, type PdfLine } from "@/lib/pdf";
import { isLocale } from "@/lib/locale";
import { taskCommand } from "@/domains/tasks/schema";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Wave 17 (O1): the club's tasks, by type; `?count=mine` (22): how many are mine, open and late. */
export async function GET(request: Request) {
  try {
    const p = await principal(request);
    if (new URL(request.url).searchParams.get("count") === "mine") return Response.json(await myTaskCount(getDb(), p), { headers: noStore });
    // 2 (6): « Année », the next twelve months; `?year=pdf&locale=` the page for the board.
    const year = new URL(request.url).searchParams.get("year");
    if (year === "1") return Response.json(await tasksYear(getDb(), p), { headers: noStore });
    if (year === "pdf") {
      const l = new URL(request.url).searchParams.get("locale") ?? "fr";
      const locale = isLocale(l) ? l : "fr";
      const v = await tasksYear(getDb(), p);
      const t = yearPdfCopy[locale],
        c = todoCopy[locale];
      const tag = locale === "en" ? "en-GB" : `${locale}-BE`;
      const day = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag, { ...o, timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
      const lines: PdfLine[] = [
        { text: `${t.title} : ${v.organization}`, size: 16, bold: true },
        { text: t.period.replace("{from}", day(v.from, { day: "numeric", month: "long", year: "numeric" })).replace("{to}", day(v.to, { day: "numeric", month: "long", year: "numeric" })), gap: 4 },
      ];
      let month = "";
      for (const i of v.items) {
        const m = day(i.date, { month: "long", year: "numeric" });
        if (m !== month) {
          month = m;
          lines.push({ text: m, bold: true, size: 13, gap: 10 });
        }
        lines.push({ text: `${day(i.date, { day: "numeric", month: "short" })} · ${c.categories[i.category]} · ${i.title} (${t.states[i.state]}${i.recurring ? `, ${t.recurring}` : ""})`, indent: 12 });
      }
      if (!v.items.length) lines.push({ text: t.empty, gap: 10 });
      return new Response(new Uint8Array(pdfDocument(lines, t.title)), {
        headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="calendrier-administratif-${v.from.slice(0, 4)}.pdf"` },
      });
    }
    return Response.json(await tasksView(getDb(), p), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 40000)));
    return Response.json(await tasksExecute(getDb(), p, taskCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
