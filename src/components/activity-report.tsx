"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { ActivityReport as Report } from "@/domains/report/service";
import { buildSlides, suggestedThanks, type Slide } from "@/domains/report/slides";
import { reportCopy, reportSections, type ReportSection } from "./report-copy";
import { financeCopy } from "./finance-copy";
import { errors } from "./access-copy";
import { useData } from "./use-api";
import { useScope } from "./use-scope";
import { cssVars } from "./css-vars";
import { Button, Card, EmptyState, PageHeader } from "./ui";
import { Icon } from "./icons";

/**
 * The season's activity report (wave 15, C11): settings, a preview with one
 * card per page of the file, the PowerPoint download for Canva and the print.
 */
export function ActivityReportPage({ locale }: { locale: Locale }) {
  const t = reportCopy[locale];
  const scope = useScope();
  const [season, setSeason] = useState("");
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? t.noData, [locale, t.noData]);
  const q = new URLSearchParams();
  if (season) q.set("season", season);
  if (scope.teamId) q.set("team", scope.teamId);
  const { data, error, denied } = useData<Report>(`/api/statistics/report?${q.toString()}`, failure);
  return (
    <main id="main" className="access activity-report">
      <PageHeader
        title={t.title}
        subtitle={t.intro}
        actions={
          <Link className="button secondary no-print" href={`/${locale}/statistics`}>
            <Icon name="back" size={16} /> {t.back}
          </Link>
        }
      />
      {denied ? (
        <EmptyState icon="lock" title={errors.FORBIDDEN?.[locale] ?? t.noData} />
      ) : !data ? (
        error ? <p role="alert">{error}</p> : <p role="status">…</p>
      ) : !data.season ? (
        <EmptyState icon="calendar" title={t.noSeason} />
      ) : (
        <Editor key={data.season.id + (data.team ?? "")} locale={locale} data={data} season={season || data.season.id} setSeason={setSeason} teamId={scope.teamId} />
      )}
    </main>
  );
}

function Editor({ locale, data, season, setSeason, teamId }: { locale: Locale; data: Report; season: string; setSeason: (s: string) => void; teamId: string | null }) {
  const t = reportCopy[locale];
  const [sections, setSections] = useState<ReportSection[]>(() => reportSections.filter((s) => s !== "finances" || data.money)),
    [word, setWord] = useState(""),
    [thanks, setThanks] = useState(() => suggestedThanks(data, t)),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState("");
  const slides = buildSlides(data, { sections, word, thanks, locale }, t, financeCopy[locale].categories);
  async function download() {
    setBusy(true);
    setFailed("");
    try {
      const r = await fetch("/api/statistics/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, team: teamId, sections, word, thanks, locale }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = (r.headers.get("Content-Disposition") ?? "").match(/filename="([^"]+)"/)?.[1] ?? "rapport.pptx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setFailed(errors[(e as Error).message]?.[locale] ?? t.noData);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="report-layout">
      <Card title={t.settings} id="report-settings" className="no-print report-settings">
        <p className="muted small">{t.privacy}</p>
        <label>
          {t.season}
          <select value={season} onChange={(e) => setSeason(e.target.value)}>
            {data.seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <p className="small">
          {t.team} : <strong>{data.team ?? t.wholeClub}</strong>
        </p>
        <fieldset className="report-sections">
          <legend>{t.sections}</legend>
          {reportSections.map((s) => (
            <label className="check" key={s}>
              <input
                type="checkbox"
                checked={sections.includes(s)}
                disabled={s === "finances" && !data.money}
                aria-describedby={s === "finances" && !data.money ? "report-finances-hint" : undefined}
                onChange={(e) => setSections((x) => (e.target.checked ? reportSections.filter((k) => k === s || x.includes(k)) : x.filter((k) => k !== s)))}
              />
              {t.sectionNames[s]}
            </label>
          ))}
          {!data.money && (
            <p id="report-finances-hint" className="muted small">
              {t.financesRight}
            </p>
          )}
        </fieldset>
        <label>
          {t.word}
          <textarea rows={4} maxLength={4000} value={word} placeholder={t.wordHint} onChange={(e) => setWord(e.target.value)} />
        </label>
        <label>
          {t.thanks}
          <textarea rows={4} maxLength={4000} value={thanks} aria-describedby="report-thanks-hint" onChange={(e) => setThanks(e.target.value)} />
          <span id="report-thanks-hint" className="muted small field-hint">
            {t.thanksHint}
          </span>
        </label>
        <div className="report-actions">
          <Button icon="document" disabled={busy || !slides.length} loading={busy} onClick={() => void download()}>
            {t.downloadPptx}
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            {t.printPdf}
          </Button>
        </div>
        {busy && <p role="status">{t.generating}</p>}
        {failed && <p role="alert">{failed}</p>}
        <section aria-labelledby="report-canva" className="report-canva">
          <h3 id="report-canva">{t.canvaTitle}</h3>
          <ol>
            {t.canvaSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      </Card>
      <section className="report-preview" aria-labelledby="report-preview-title">
        <h2 id="report-preview-title" className="no-print">
          {t.preview}
        </h2>
        {slides.length ? slides.map((s, i) => <SlideCard key={s.id} locale={locale} slide={s} n={i + 1} />) : <EmptyState icon="document" title={t.noData} />}
      </section>
    </div>
  );
}

/** One page of the preview, laid out like the slide. */
function SlideCard({ locale, slide, n }: { locale: Locale; slide: Slide; n: number }) {
  const t = reportCopy[locale];
  const max = (values: number[]) => Math.max(1, ...values);
  return (
    <article className="report-slide" data-slide={slide.id} aria-labelledby={`slide-${slide.id}`}>
      <p className="report-page muted small no-print">{t.page.replace("{n}", String(n))}</p>
      {slide.id === "cover" ? (
        <div className="report-cover">
          <div>
            <p className="muted">{slide.subtitle}</p>
            <h3 id={`slide-${slide.id}`}>{slide.title}</h3>
          </div>
          <div className="report-photo" role="img" aria-label={t.photo}>
            {t.photo}
          </div>
        </div>
      ) : (
        <>
          <h3 id={`slide-${slide.id}`}>{slide.title}</h3>
          {slide.numbers && (
            <ul className="report-numbers">
              {slide.numbers.map((x) => (
                <li key={x.label}>
                  <strong>{x.value}</strong>
                  <span>{x.label}</span>
                  <span className="muted small">{x.note}</span>
                </li>
              ))}
            </ul>
          )}
          {slide.text && <p className="pre-line">{slide.text}</p>}
          {slide.lines && (
            <ul className="report-lines">
              {slide.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
          {slide.table && (
            <table className="compact-table">
              <thead>
                <tr>
                  {slide.table.head.map((h) => (
                    <th scope="col" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slide.table.rows.map((r) => (
                  <tr key={r.join("|")}>
                    <th scope="row">{r[0]}</th>
                    {r.slice(1).map((c, i) => (
                      <td key={i}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {slide.charts && (
            <div className="report-charts">
              {slide.charts.map((c) => (
                <figure key={c.title}>
                  <figcaption>{c.title}</figcaption>
                  <ul className="report-bars">
                    {c.labels.map((l, i) => (
                      <li key={l}>
                        <span>{l}</span>
                        <span className="report-bar" aria-hidden="true">
                          <span style={cssVars({ value: Math.round((c.values[i] / max(c.values)) * 100) })} />
                        </span>
                        <span className="num">{new Intl.NumberFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c.values[i])}</span>
                      </li>
                    ))}
                  </ul>
                </figure>
              ))}
            </div>
          )}
          {slide.photos && slide.photos.length > 0 && (
            <ul className="report-photos">
              {slide.photos.map((p) => (
                <li key={p.caption}>
                  <div className="report-photo" role="img" aria-label={t.photo}>
                    {t.photo}
                  </div>
                  <span className="small">{p.caption}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </article>
  );
}
