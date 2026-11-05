import { z } from "zod";
import { getDb } from "@/lib/db";
import { activityReport } from "@/domains/report/service";
import { buildSlides } from "@/domains/report/slides";
import { reportPptx } from "@/domains/report/pptx";
import { reportPdf } from "@/domains/report/pdf";
import { reportCopy, reportSections } from "@/components/report-copy";
import { financeCopy } from "@/components/finance-copy";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** The season's activity report (wave 15, C11): the figures as JSON for the preview. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    return Response.json(
      await activityReport(getDb(), await principalIn(request, "statistics"), { season: q.get("season") ?? undefined, team: q.get("team") ?? undefined }),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}

const body = z.object({
  season: z.uuid().optional(),
  team: z.uuid().nullable().optional(),
  sections: z.array(z.enum(reportSections)).max(reportSections.length),
  word: z.string().max(4000),
  thanks: z.string().max(4000),
  locale: z.enum(["fr", "nl", "en"]),
  /** Lot 5 (05/11/2026): the same pages as a PDF for the general assembly. */
  format: z.enum(["pptx", "pdf"]).default("pptx"),
});
/** The same report as a PowerPoint file, to finish in Canva. */
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "statistics");
    const o = body.parse(JSON.parse(new TextDecoder().decode(await bounded(request, 20000))));
    const report = await activityReport(getDb(), p, { season: o.season, team: o.team ?? undefined });
    const t = reportCopy[o.locale];
    const slides = buildSlides(report, o, t, financeCopy[o.locale].categories);
    const title = report.season ? t.reportOf.replace("{season}", report.season.name) : t.title;
    const name = title.normalize("NFD").replace(/[^\w -]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
    if (o.format === "pdf") {
      const generated = new Intl.DateTimeFormat(o.locale === "en" ? "en-GB" : `${o.locale}-BE`, { dateStyle: "long", timeZone: "Europe/Brussels" }).format(new Date());
      const pdf = reportPdf(slides, report.club.name, title, generated);
      return new Response(new Uint8Array(pdf) as BodyInit, {
        headers: { "Cache-Control": "no-store", "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name || "rapport"}.pdf"`, "X-Content-Type-Options": "nosniff" },
      });
    }
    const file = await reportPptx(slides, { club: report.club.name, title, photo: t.photo });
    return new Response(new Uint8Array(file) as BodyInit, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${name || "rapport"}.pptx"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
