"use client";
import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { impactView } from "@/domains/report/impact";
import { adjustable } from "@/domains/report/impact-schema";
import { errors } from "./access-copy";
import { impactCopy, fill } from "./impact-copy";
import { useData } from "./use-api";
import { HorizontalBars } from "./charts";
import { Icon } from "./icons";
import { Card, EmptyState, KpiCard, PageHeader } from "./ui";

/**
 * H13: the impact report on screen: the key figures (a missing datum said
 * as such, never 0), beneficiaries by age and by municipality, the
 * volunteering, the definitions, the adjustments with their reason; then
 * PDF and Excel, and filing with a grant.
 */
type View = Awaited<ReturnType<typeof impactView>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const day = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
const post = async (body: unknown) => {
  const r = await fetch("/api/statistics/impact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const v = r ? await r.json().catch(() => ({})) : {};
  return { ok: !!r?.ok, code: (v.error as string) ?? "" };
};
type Period = { from: string; to: string; grant?: string };

export function Impact({ locale, start }: { locale: Locale; start: Partial<Period> }) {
  const t = impactCopy[locale];
  const [period, setPeriod] = useState<Partial<Period>>(start);
  const q = new URLSearchParams(Object.entries(period).filter(([, v]) => !!v) as [string, string][]).toString();
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? t.unavailable, [locale, t]);
  const { data, error, denied, reload } = useData<View>(`/api/statistics/impact${q ? `?${q}` : ""}`, failure);
  const [status, setStatus] = useState("");
  async function act(body: Record<string, unknown>, done = t.saved) {
    if (!data) return false;
    const r = await post({ ...body, organizationId: data.organization_id });
    setStatus(r.ok ? done : failure(r.code));
    if (r.ok) await reload();
    return r.ok;
  }
  return (
    <main id="main" className="access impact-report">
      <PageHeader
        title={t.title}
        subtitle={t.intro}
        actions={
          <Link className="button secondary" href={`/${locale}/statistics`}>
            <Icon name="back" size={16} /> {t.back}
          </Link>
        }
      />
      {denied ? (
        <EmptyState icon="lock" title={errors.FORBIDDEN?.[locale] ?? t.unavailable} />
      ) : error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p role="status">{t.loading}</p>
      ) : (
        <>
          <PeriodForm locale={locale} data={data} choose={(p) => setPeriod({ ...p, grant: period.grant })} />
          <p role="status" className="muted">
            {status}
          </p>
          <Report locale={locale} data={data} act={act} grant={period.grant} />
        </>
      )}
    </main>
  );
}

function PeriodForm({ locale, data, choose }: { locale: Locale; data: View; choose: (p: Period) => void }) {
  const t = impactCopy[locale];
  const f = data.figures;
  const [kind, setKind] = useState<"season" | "year" | "custom">(data.seasons.some((s) => s.starts_on === f.from && s.ends_on === f.to) ? "season" : f.from.endsWith("-01-01") && f.to.endsWith("-12-31") && f.from.slice(0, 4) === f.to.slice(0, 4) ? "year" : "custom");
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = new FormData(e.currentTarget);
    if (kind === "season") {
      const s = data.seasons.find((x) => x.id === v.get("season"));
      if (s) choose({ from: s.starts_on, to: s.ends_on });
    } else if (kind === "year") {
      const y = String(v.get("year"));
      choose({ from: `${y}-01-01`, to: `${y}-12-31` });
    } else choose({ from: String(v.get("from")), to: String(v.get("to")) });
  }
  const years = [...new Set(data.seasons.flatMap((s) => [s.starts_on.slice(0, 4), s.ends_on.slice(0, 4)]).concat(f.from.slice(0, 4)))].sort().reverse();
  return (
    <form className="impact-period" onSubmit={submit}>
      <fieldset>
        <legend>{t.period}</legend>
        <div className="impact-kinds">
          {(["season", "year", "custom"] as const).map((k) => (
            <label className="check" key={k} htmlFor={`impact-kind-${k}`}>
              <input id={`impact-kind-${k}`} type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
              {t.periodKind[k]}
            </label>
          ))}
        </div>
        {kind === "season" && (
          <label htmlFor="impact-season">
            {t.season}
            <select id="impact-season" name="season" defaultValue={data.seasons.find((s) => s.starts_on === f.from)?.id}>
              {data.seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === "year" && (
          <label htmlFor="impact-year">
            {t.year}
            <select id="impact-year" name="year" defaultValue={f.from.slice(0, 4)}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === "custom" && (
          <div className="form-pair">
            <label htmlFor="impact-from">
              {t.from}
              <input id="impact-from" name="from" type="date" required defaultValue={f.from} />
            </label>
            <label htmlFor="impact-to">
              {t.to}
              <input id="impact-to" name="to" type="date" required defaultValue={f.to} />
            </label>
          </div>
        )}
        <p className="actions">
          <button type="submit" className="button secondary">
            {t.show}
          </button>
        </p>
      </fieldset>
    </form>
  );
}

function Report({ locale, data, act, grant }: { locale: Locale; data: View; act: (b: Record<string, unknown>, done?: string) => Promise<boolean>; grant?: string }) {
  const t = impactCopy[locale];
  const f = data.figures;
  const n = (v: number | null) => (v === null ? t.noData : new Intl.NumberFormat(tag(locale)).format(v));
  const money = (c: number) => new Intl.NumberFormat(tag(locale), { style: "currency", currency: "EUR" }).format(c / 100);
  const adj = (x: { computed: number | null; value: number | null }) => (x.computed !== x.value ? fill(t.adjustedFrom, { v: n(x.computed) }) : undefined);
  const range = `from=${f.from}&to=${f.to}${grant ? `&grant=${grant}` : ""}&locale=${locale}`;
  const cards: [string, string, string | undefined][] = [
    [t.beneficiaries, n(f.beneficiaries.value), adj(f.beneficiaries)],
    [t.newPlayers, n(f.newPlayers), undefined],
    [t.retention, f.retention ? fill(t.retentionValue, f.retention) : t.noData, undefined],
    [t.sessions, n(f.sessions.value), adj(f.sessions)],
    [t.sportHours, n(f.sportHours.value), adj(f.sportHours)],
    [t.matches, n(f.matches), undefined],
    [t.tournaments, n(f.tournaments), undefined],
    [t.kilometres, n(f.kilometres.value), adj(f.kilometres)],
    [t.coachesTrained, n(f.coachesTrained), undefined],
    [t.volunteerHours, n(f.volunteer.value), adj(f.volunteer)],
    ...(f.valuationCents !== null ? ([[t.valuation, money(f.valuationCents), undefined]] as [string, string, undefined][]) : []),
  ];
  return (
    <>
      <p className="muted">
        {day(locale, f.from)} · {day(locale, f.to)}
        {data.grant && <> · {fill(t.grantFor, { funder: data.grant.funder })}</>}
      </p>
      <p className="actions">
        <a className="button secondary" href={`/api/statistics/impact?format=pdf&${range}`} download>
          {t.pdf}
        </a>
        <a className="button secondary" href={`/api/statistics/impact?format=xlsx&${range}`} download>
          {t.xlsx}
        </a>
        {data.grant && data.can.attach && (
          <button type="button" className="button" onClick={() => void act({ action: "attach", grantId: data.grant!.id, from: f.from, to: f.to, locale }, t.attached)}>
            {t.attach}
          </button>
        )}
      </p>
      <section aria-labelledby="impact-key">
        <h2 id="impact-key">{t.keyFigures}</h2>
        <ul className="stat-row-grid" data-cols="4">
          {cards.map(([label, value, hint]) => (
            <li key={label}>
              <KpiCard label={label} value={value} description={hint} />
            </li>
          ))}
        </ul>
        <p className="muted small">{t.sex}</p>
        <p className="muted small">{t.origin}</p>
      </section>
      <div className="grid">
        <Card title={t.byAge} labelledBy="impact-age" headingId="impact-age">
          <HorizontalBars
            summary={fill(t.byAgeSummary, { n: f.beneficiaries.computed ?? 0 })}
            rows={Object.entries(f.byAge).map(([k, v]) => ({ id: k, label: t.ages[k], value: v, color: "var(--primary)" }))}
            format={(v) => String(v)}
          />
        </Card>
        <Card title={t.communes} labelledBy="impact-communes" headingId="impact-communes">
          {f.communes.length ? <HorizontalBars summary={t.communesSummary} rows={f.communes.slice(0, 12).map((c) => ({ id: c.name, label: c.name, value: c.n, color: "var(--chart-2)" }))} format={(v) => String(v)} /> : <p className="muted">{t.noData}</p>}
          {f.unknownCommune > 0 && <p className="muted small">{fill(t.unknownCommune, { n: f.unknownCommune })}</p>}
        </Card>
        <Card title={t.volunteer} labelledBy="impact-volunteer" headingId="impact-volunteer">
          <ul className="plain-list">
            <li>{fill(t.volunteerTasks, { v: f.volunteer.tasks })}</li>
            <li>{fill(t.volunteerSupervision, { v: f.volunteer.supervision })}</li>
            <li>{fill(t.volunteerDrivers, { v: f.volunteer.drivers })}</li>
          </ul>
        </Card>
      </div>
      <Card title={t.definitions} labelledBy="impact-defs" headingId="impact-defs">
        <dl className="impact-definitions">
          {Object.entries(t.definitionsList).map(([k, v]) => (
            <div key={k}>
              <dt>{(t as Record<string, unknown>)[k] as string}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card title={t.adjustments} labelledBy="impact-adj" headingId="impact-adj">
        <p className="muted">{t.adjustIntro}</p>
        {f.adjustments.length ? (
          <ul className="plain-list">
            {f.adjustments.map((a) => (
              <li key={a.id}>
                {(t as Record<string, unknown>)[a.indicator] as string} {a.delta > 0 ? "+" : ""}
                {a.delta} · {a.note}
                {data.can.manage && (
                  <>
                    {" "}
                    <button type="button" className="text-button" onClick={() => void act({ action: "removeAdjustment", id: a.id })}>
                      {t.remove}
                      <span className="sr-only"> : {a.note}</span>
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.adjustNone}</p>
        )}
        {data.can.manage && (
          <form
            className="finance-form"
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const form = e.currentTarget;
              const v = new FormData(form);
              void act({ action: "adjust", from: f.from, to: f.to, indicator: String(v.get("indicator")), delta: Number(String(v.get("delta")).replace(",", ".")), note: String(v.get("note") ?? "") }).then((ok) => ok && form.reset());
            }}
          >
            <label htmlFor="impact-indicator">
              {t.indicator}
              <select id="impact-indicator" name="indicator">
                {adjustable.map((k) => (
                  <option key={k} value={k}>
                    {(t as Record<string, unknown>)[k] as string}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="impact-delta">
              {t.delta}
              <input id="impact-delta" name="delta" required inputMode="decimal" pattern="-?[0-9]+([,.][0-9])?" />
            </label>
            <label htmlFor="impact-note">
              {t.note}
              <input id="impact-note" name="note" required minLength={3} maxLength={500} placeholder={t.noteHint} />
            </label>
            <p className="actions">
              <button type="submit" className="button secondary">
                {t.adjust}
              </button>
            </p>
          </form>
        )}
      </Card>
      {data.can.manage && <Settings locale={locale} data={data} act={act} />}
    </>
  );
}

function Settings({ locale, data, act }: { locale: Locale; data: View; act: (b: Record<string, unknown>) => Promise<boolean> }) {
  const t = impactCopy[locale];
  const s = data.figures.settings;
  return (
    <details className="impact-settings">
      <summary>{t.settings}</summary>
      <form
        className="finance-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const v = new FormData(e.currentTarget);
          const rate = String(v.get("rate") ?? "").trim();
          void act({
            action: "settings",
            taskHours: Object.fromEntries(Object.keys(s.taskHours).map((k) => [k, Number(String(v.get(`h-${k}`)).replace(",", ".")) || 0])),
            tripHours: Number(String(v.get("trip")).replace(",", ".")) || 0,
            hourlyRateCents: rate ? Math.round(Number(rate.replace(",", ".")) * 100) : null,
          });
        }}
      >
        {Object.entries(s.taskHours).map(([k, h]) => (
          <label key={k} htmlFor={`impact-h-${k}`}>
            {fill(t.taskHours, { category: t.categories[k] ?? k })}
            <input id={`impact-h-${k}`} name={`h-${k}`} inputMode="decimal" pattern="[0-9]+([,.][0-9])?" defaultValue={String(h)} />
          </label>
        ))}
        <label htmlFor="impact-trip">
          {t.tripHours}
          <input id="impact-trip" name="trip" inputMode="decimal" pattern="[0-9]+([,.][0-9])?" defaultValue={String(s.tripHours)} />
        </label>
        <label htmlFor="impact-rate">
          {t.rate}
          <input id="impact-rate" name="rate" inputMode="decimal" pattern="[0-9]+([,.][0-9]{1,2})?" defaultValue={s.hourlyRateCents === null ? "" : String(s.hourlyRateCents / 100)} />
        </label>
        <p className="actions">
          <button type="submit" className="button secondary">
            {t.saveSettings}
          </button>
        </p>
      </form>
    </details>
  );
}
