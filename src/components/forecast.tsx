"use client";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { forecastView } from "@/domains/finance/forecast";
import { errors } from "./access-copy";
import { forecastCopy, fill } from "./forecast-copy";
import { useData } from "./use-api";
import { ChartFrame, LineChart, type ChartSeries } from "./charts";
import { FinanceNav } from "./finance-nav";
import { DataTable, EmptyState, KpiCard, PageHeader } from "./ui";

/**
 * H4: « Prévisions », the cash expected month by month over 12 months in
 * two scenarios (certain only, certain and probable), the alert threshold,
 * the movements of each month in a table, and simulation lines that never
 * reach the ledger.
 */
type View = Awaited<ReturnType<typeof forecastView>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const money = (l: Locale, c: number) => new Intl.NumberFormat(tag(l), { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c / 100);
const monthName = (l: Locale, m: string, short = false) => new Intl.DateTimeFormat(tag(l), { month: short ? "short" : "long", year: short ? "2-digit" : "numeric", timeZone: "UTC" }).format(new Date(m + "-15T12:00:00Z"));
const post = async (body: unknown) => {
  const r = await fetch("/api/finance/forecast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const v = r ? await r.json().catch(() => ({})) : {};
  return { ok: !!r?.ok, code: (v.error as string) ?? "" };
};
const euros = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);

export function Forecast({ locale }: { locale: Locale }) {
  const t = forecastCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? t.unavailable, [locale, t]);
  const { data, error, reload } = useData<View>("/api/finance/forecast", failure);
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  async function act(body: Record<string, unknown>) {
    if (!data) return false;
    setBusy(true);
    const r = await post({ ...body, organizationId: data.organization_id });
    setBusy(false);
    setStatus(r.ok ? t.saved : failure(r.code));
    if (r.ok) await reload();
    return r.ok;
  }
  return (
    <main id="main" className="access finance forecast">
      <PageHeader
        title={t.title}
        subtitle={t.intro}
        actions={
          data ? (
            <a className="button secondary" href={`/api/finance/forecast?format=pdf&locale=${locale}`} download>
              {t.pdf}
            </a>
          ) : null
        }
      />
      <FinanceNav locale={locale} current="forecast" />
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">{t.loading}</p>}
      <p role="status" className="muted">
        {status}
      </p>
      {data && <Body locale={locale} data={data} busy={busy} act={act} />}
    </main>
  );
}

function Body({ locale, data, busy, act }: { locale: Locale; data: View; busy: boolean; act: (b: Record<string, unknown>) => Promise<boolean> }) {
  const t = forecastCopy[locale];
  const f = data.forecast;
  const rows = f.rows;
  const values = [f.threshold, ...rows.flatMap((r) => [r.certain, r.likely])];
  const lo = Math.min(0, ...values),
    hi = Math.max(1, ...values);
  const lowest = rows.reduce((a, b) => (b.certain < a.certain ? b : a), rows[0]);
  const series: ChartSeries[] = [
    { id: "certain", label: t.certain, color: "var(--primary)", values: rows.map((r) => r.certain), width: 3 },
    { id: "likely", label: t.likely, color: "var(--chart-2)", values: rows.map((r) => r.likely), dashed: true },
    { id: "threshold", label: t.line, color: "var(--danger)", values: rows.map(() => f.threshold), dashed: true, width: 1 },
  ];
  return (
    <>
      <ul className="stat-row-grid" data-cols="3">
        <li>
          <KpiCard label={t.start} value={money(locale, f.start)} icon="funding" tone={f.start < 0 ? "danger" : "primary"} />
        </li>
        <li>
          <KpiCard label={t.reserved} value={money(locale, data.reserved)} icon="shield" />
        </li>
        <li>
          <KpiCard label={t.threshold} value={money(locale, f.threshold)} icon="alert" />
        </li>
      </ul>
      <p className={f.alert ? "notice" : "muted"} role={f.alert ? "alert" : undefined}>
        {f.alert
          ? fill(t.alert, { month: monthName(locale, f.alert.month), amount: money(locale, f.alert.balance), list: f.alert.biggest.map((b) => `${b.label} ${money(locale, b.cents)}`).join(", ") || "…" })
          : t.noAlert}
      </p>
      {data.can.edit && (
        <form
          className="inline-form"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            void act({ action: "threshold", cents: euros(String(new FormData(e.currentTarget).get("threshold") ?? "0")) });
          }}
        >
          <label htmlFor="fc-threshold">
            {t.threshold}
            <input id="fc-threshold" name="threshold" inputMode="decimal" pattern="-?[0-9]+([,.][0-9]{1,2})?" defaultValue={String(f.threshold / 100)} />
          </label>
          <button type="submit" className="button secondary sm" disabled={busy}>
            {t.thresholdSave}
          </button>
        </form>
      )}
      <p className="muted small">{fill(t.rate, { n: Math.round(data.rate * 100) })}</p>
      <section aria-labelledby="fc-chart">
        <h2 id="fc-chart">{t.chart}</h2>
        <ChartFrame
          locale={locale}
          legend={series.map(({ id, label, color, dashed }) => ({ id, label, color, dashed }))}
          table={<MonthTable locale={locale} data={data} />}
        >
          {(hidden) => (
            <LineChart
              locale={locale}
              summary={fill(t.chartSummary, { from: money(locale, f.start), to: money(locale, rows[rows.length - 1].certain), low: money(locale, lowest.certain), month: monthName(locale, lowest.month) })}
              categories={rows.map((r) => monthName(locale, r.month, true))}
              titles={rows.map((r) => monthName(locale, r.month))}
              series={series.filter((x) => !hidden.has(x.id))}
              min={lo}
              max={hi}
              format={(v) => money(locale, v)}
            />
          )}
        </ChartFrame>
      </section>
      <section aria-labelledby="fc-table">
        <h2 id="fc-table">{t.table}</h2>
        <MonthTable locale={locale} data={data} />
        {rows
          .filter((r) => r.items.length)
          .map((r) => (
            <details key={r.month} className="forecast-month">
              <summary>{fill(t.details, { month: monthName(locale, r.month) })}</summary>
              <ul className="plain-list">
                {r.items.map((i, k) => (
                  <li key={k}>
                    {i.direction === "in" ? "+" : "−"} {money(locale, i.cents)} · {t.sources[i.source]} : {i.label} · {i.certain ? t.sureTag : t.maybeTag}
                  </li>
                ))}
              </ul>
            </details>
          ))}
      </section>
      <section aria-labelledby="fc-manual">
        <h2 id="fc-manual">{t.manual}</h2>
        <p className="muted">{t.manualIntro}</p>
        {data.lines.length ? (
          <ul className="plain-list">
            {data.lines.map((l) => (
              <li key={l.id}>
                {monthName(locale, l.month)} · {l.label} · {l.direction === "in" ? "+" : "−"} {money(locale, l.amount_cents)}
                {l.probable ? ` · ${t.maybeTag}` : ""}
                {data.can.edit && (
                  <>
                    {" "}
                    <button type="button" className="text-button" disabled={busy} onClick={() => void act({ action: "removeLine", id: l.id })}>
                      {t.remove}
                      <span className="sr-only"> : {l.label}</span>
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t.manualNone} />
        )}
        {data.can.edit && (
          <form
            className="finance-form forecast-line"
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const form = e.currentTarget;
              const v = new FormData(form);
              void act({
                action: "line",
                month: String(v.get("month")),
                label: String(v.get("label") ?? ""),
                direction: String(v.get("direction")),
                amountCents: euros(String(v.get("amount") ?? "0")),
                probable: v.get("probable") === "on",
              }).then((ok) => ok && form.reset());
            }}
          >
            <label htmlFor="fc-month">
              {t.manualMonth}
              <select id="fc-month" name="month">
                {rows.map((r) => (
                  <option key={r.month} value={r.month}>
                    {monthName(locale, r.month)}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="fc-label">
              {t.manualLabel}
              <input id="fc-label" name="label" required minLength={2} maxLength={160} placeholder={t.manualLabelHint} />
            </label>
            <label htmlFor="fc-direction">
              {t.manualDirection}
              <select id="fc-direction" name="direction" defaultValue="out">
                <option value="out">{t.manualOut}</option>
                <option value="in">{t.manualIn}</option>
              </select>
            </label>
            <label htmlFor="fc-amount">
              {t.manualAmount}
              <input id="fc-amount" name="amount" required inputMode="decimal" pattern="[0-9]+([,.][0-9]{1,2})?" />
            </label>
            <label className="check" htmlFor="fc-probable">
              <input id="fc-probable" name="probable" type="checkbox" />
              {t.manualProbable}
            </label>
            <p className="actions">
              <button type="submit" className="button" disabled={busy}>
                {t.manualAdd}
              </button>
            </p>
          </form>
        )}
      </section>
    </>
  );
}

function MonthTable({ locale, data }: { locale: Locale; data: View }) {
  const t = forecastCopy[locale];
  const f = data.forecast;
  const rows = f.rows;
  return (
    <DataTable label={t.table} caption={t.table}>
      <thead>
        <tr>
          <th scope="col">{t.month}</th>
          <th scope="col">{t.inCertain}</th>
          <th scope="col">{t.outCertain}</th>
          <th scope="col">{t.probable}</th>
          <th scope="col">{t.balanceCertain}</th>
          <th scope="col">{t.balanceLikely}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.month} data-low={r.certain < f.threshold || undefined}>
            <th scope="row">{monthName(locale, r.month)}</th>
            <td>{money(locale, r.inCertain)}</td>
            <td>{money(locale, r.outCertain)}</td>
            <td>{money(locale, r.inProbable - r.outProbable)}</td>
            <td>{money(locale, r.certain)}</td>
            <td>{money(locale, r.likely)}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
