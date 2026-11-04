"use client";
import { reservedCopy } from "./reserved-funds-copy";
import { FinanceNav } from "./finance-nav";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import { useScope } from "./use-scope";
import type { financeReport } from "@/domains/finance/service";
import { financeCopy, financeExtras } from "./finance-copy";
import { errors } from "./access-copy";
import { Icon } from "./icons";
import { Card } from "./ui";

type Report = Awaited<ReturnType<typeof financeReport>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

/** Printable season report: the browser's "Save as PDF" produces the PDF. */
export function FinanceReport({
  locale,
  season,
}: {
  locale: Locale;
  season: string;
}) {
  const t = financeCopy[locale],
    x = financeExtras[locale];
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState("");
  // The team chosen in the top bar (wave 12) filters the report; the whole club stays a line apart.
  const scope = useScope();
  const teamQuery = scope.teamId ? "&team=" + scope.teamId : "";
  useEffect(() => {
    let cancelled = false;
    fetch("/api/finance/report?season=" + encodeURIComponent(season) + teamQuery, {
      cache: "no-store",
    })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!cancelled) setReport(v);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(errors[e.message]?.[locale] ?? t.restricted);
      });
    return () => {
      cancelled = true;
    };
  }, [season, locale, t.restricted, teamQuery]);
  const money = (cents: number) =>
    new Intl.NumberFormat(tag(locale), {
      style: "currency",
      currency: "EUR",
    }).format(cents / 100);
  const day = (d: string) =>
    new Intl.DateTimeFormat(tag(locale), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(d + "T12:00:00Z"));

  return (
    <main id="main" className="access finance finance-report">
      <p className="back-link no-print">
        <Link href={`/${locale}/funding`}>
          <Icon name="back" size={16} />
          {x.back}
        </Link>
      </p>
      <div className="no-print">
        <FinanceNav locale={locale} current="accounts" />
      </div>
      {!report && <h1>{x.report}</h1>}
      {error && <p role="alert">{error}</p>}
      {!report && !error && <p role="status">…</p>}
      {report && (
        <>
          <header className="print-only report-letterhead">
            {report.organization.logo_version && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/club/logo?org=${report.organization.id}&v=${report.organization.logo_version}`} alt="" />
            )}
            <div>
              <strong>{report.club}</strong>
              {(report.organization.company_number || report.organization.address) && (
                <span>{[report.organization.company_number, report.organization.address].filter(Boolean).join(" · ")}</span>
              )}
              <span>
                {x.reportSeason} {report.season.label}
              </span>
            </div>
          </header>
          <div className="report-head">
            <div>
              <h1>
                {x.report} {report.season.label}
                {report.team && <span className="muted"> · {report.team}</span>}
              </h1>
              <p>
                {report.club} · {day(report.season.from)} →{" "}
                {day(report.season.to)} · {x.generated}{" "}
                {day(report.generated_on)}
              </p>
            </div>
            <div className="directory-actions no-print">
              <a
                className="button secondary"
                href={`/api/finance/report?format=csv&season=${report.season.label}`}
              >
                {x.csv}
              </a>
              <button
                type="button"
                className="button"
                onClick={() => window.print()}
              >
                {x.print}
              </button>
            </div>
          </div>
          <dl className="report-totals">
            <div>
              <dt>{x.opening}</dt>
              <dd>{money(report.opening)}</dd>
            </div>
            <div>
              <dt>{t.income}</dt>
              <dd className="amount-in">{money(report.summary.income)}</dd>
            </div>
            <div>
              <dt>{t.expenses}</dt>
              <dd className="amount-out">{money(report.summary.expenses)}</dd>
            </div>
            <div>
              <dt>{x.closing}</dt>
              <dd>{money(report.closing)}</dd>
            </div>
            {report.reservedAtClose && report.reservedAtClose.total > 0 && (
              <div>
                <dt>{reservedCopy[locale].atClose}</dt>
                <dd>
                  {money(report.reservedAtClose.total)} ({report.reservedAtClose.items.map((r) => `${r.label} : ${money(r.remaining)}`).join(", ")})
                </dd>
              </div>
            )}
          </dl>
          {report.byTeam.length > 1 && (
            <Card title={x.byTeam} labelledBy="report-teams" headingId="report-teams">
              <div className="table-scroll">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th scope="col">{x.team}</th>
                      <th scope="col" className="num">{t.income}</th>
                      <th scope="col" className="num">{t.expenses}</th>
                      <th scope="col" className="num">{x.result}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byTeam.map((row) => (
                      <tr key={row.team_id ?? "club"} data-current={row.team_id === report.teamId || undefined}>
                        <th scope="row">{row.team_id ? row.name : x.wholeClub}</th>
                        <td className="num amount-in">{money(row.income)}</td>
                        <td className="num amount-out">{money(row.expenses)}</td>
                        <td className="num">{money(row.income - row.expenses)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <Card title={t.byCategory} labelledBy="report-budget" headingId="report-budget">
            <div className="table-scroll">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">{t.category}</th>
                    <th scope="col">{t.direction}</th>
                    <th scope="col" className="num">
                      {x.planned}
                    </th>
                    <th scope="col" className="num">
                      {x.actual}
                    </th>
                    <th scope="col" className="num">
                      {x.gap}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.comparison.map((r) => (
                    <tr key={r.direction + r.category}>
                      <td>{t.categories[r.category] ?? r.category}</td>
                      <td>{r.direction === "in" ? t.in : t.out}</td>
                      <td className="num">
                        {r.planned ? money(r.planned) : ""}
                      </td>
                      <td className="num">{money(r.actual)}</td>
                      <td className="num">
                        {r.planned
                          ? (r.gap >= 0 ? "+" : "−") + money(Math.abs(r.gap))
                          : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title={x.lines} labelledBy="report-lines" headingId="report-lines">
            <div className="table-scroll">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">{t.date}</th>
                    <th scope="col">{t.label}</th>
                    <th scope="col">{t.category}</th>
                    <th scope="col">{x.receipts}</th>
                    <th scope="col" className="num">
                      {t.amount}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.entries.map((e) => (
                    <tr key={e.id}>
                      <td>{day(e.occurred_on)}</td>
                      <td>
                        {e.label}
                        {e.counterparty && (
                          <span className="muted"> · {e.counterparty}</span>
                        )}
                      </td>
                      <td>{t.categories[e.category] ?? e.category}</td>
                      <td>{e.receipts ? x.yes : ""}</td>
                      <td
                        className={
                          "num " +
                          (e.direction === "in" ? "amount-in" : "amount-out")
                        }
                      >
                        {e.direction === "in" ? "+" : "−"}
                        {money(e.amount_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </main>
  );
}
