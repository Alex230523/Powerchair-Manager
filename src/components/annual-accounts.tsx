"use client";
import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { accountsView } from "@/domains/accounts/service";
import { expenseRubrics, incomeRubrics, type ManualLine } from "@/domains/accounts/schema";
import { formatCents } from "@/domains/dashboard/summary";
import { accountsCopy } from "./accounts-copy";
import { financeCopy } from "./finance-copy";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { Badge, Button, Card, DataTable, EmptyState, PageHeader, type Tone } from "./ui";
import { FinanceNav } from "./finance-nav";
import { financeSectionsCopy } from "./finance-sections-copy";
import { Icon } from "./icons";

type View = Awaited<ReturnType<typeof accountsView>>;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const statusTone: Record<string, Tone> = { draft: "neutral", verified: "info", approved: "success", filed: "success" };
const checkTone: Record<string, Tone> = { ok: "success", fail: "warning", na: "neutral" };

/**
 * Annual accounts (wave 15, C12): a draft prepared from the ledger, to check,
 * complete, approve at the general assembly and file. Printing gives the PDF
 * with the club's letterhead and the signatures.
 */
export function AnnualAccounts({ locale, year: initialYear }: { locale: Locale; year?: string }) {
  const a = accountsCopy[locale],
    f = financeCopy[locale];
  const [year, setYear] = useState(initialYear ?? "");
  const failure = useCallback((code: string) => (code === "ACCOUNTS_LOCKED" ? a.locked : (errors[code]?.[locale] ?? a.empty)), [a.locked, a.empty, locale]);
  const { data, error, setError, denied, reload } = useData<View>(`/api/accounts${year ? `?year=${year}` : ""}`, failure);
  const { busy, message, post } = usePost("/api/accounts", reload, setError, failure);
  const money = (c: number) => formatCents(c, locale);
  const day = (d: string | null) => (d ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { dateStyle: "long", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z")) : "");
  if (!data)
    return (
      <main id="main" className="access annual-accounts">
        <PageHeader title={a.title} />
        {denied ? <EmptyState icon="lock" title={errors.FORBIDDEN?.[locale] ?? a.empty} /> : error ? <p role="alert">{error}</p> : <p role="status">…</p>}
      </main>
    );
  const r = data.record;
  const status = r?.status ?? "draft";
  const editable = data.can.manage && status === "draft";
  const fig = data.figures,
    prev = data.previous;
  const send = (body: Record<string, unknown>, done = a.saved) => post({ organizationId: data.organization_id, yearStart: data.year.from, ...body }, done);
  return (
    <main id="main" className="access annual-accounts">
      <header className="print-only report-letterhead">
        {data.club.logo_version && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/club/logo?org=${data.organization_id}&v=${data.club.logo_version}`} alt="" />
        )}
        <div>
          <strong>{data.club.name}</strong>
          {data.club.company_number && (
            <span>
              {a.companyNumber} : {data.club.company_number}
            </span>
          )}
          {data.club.address && (
            <span>
              {a.seat} : {data.club.address}
            </span>
          )}
          <span>
            {a.year} {data.year.label} · {day(data.year.from)} · {day(data.year.to)}
          </span>
        </div>
      </header>
      <PageHeader
        title={a.title}
        subtitle={a.intro}
        actions={
          <span className="no-print row-actions">
            <Link className="button secondary" href={`/${locale}/funding`}>
              <Icon name="back" size={16} /> {a.back}
            </Link>
            <a className="button secondary" href={`/api/accounts/export?year=${data.year.from}&locale=${locale}`} download>
              {a.exportXlsx}
            </a>
            <Link className="button secondary" href={`/${locale}/funding/report`}>
              {financeSectionsCopy[locale].annualReport}
            </Link>
            <Button onClick={() => window.print()}>{a.print}</Button>
          </span>
        }
      />
      <div className="no-print">
        <FinanceNav locale={locale} current="accounts" />
      </div>
      <p className="notice accounts-banner" role="note">
        <Icon name="alert" size={16} /> {a.banner} {a.disclaimer}
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="accounts-bar no-print">
        <label>
          {a.year}
          <select value={data.year.from} onChange={(e) => setYear(e.target.value)}>
            {data.years.map((y) => (
              <option key={y.from} value={y.from}>
                {y.label}
              </option>
            ))}
          </select>
        </label>
        <Badge tone={statusTone[status]} dot>
          {a.statuses[status]}
        </Badge>
        {r && r.version > 1 && <Badge tone="neutral">{fill(a.version, { n: r.version })}</Badge>}
        {(status === "approved" || status === "filed") && <span className="muted small">{a.frozen}</span>}
      </div>

      <Card title={a.statement} id="accounts-statement">
        {fig.lineCount === 0 && <p className="muted">{a.empty}</p>}
        <DataTable label={a.statement}>
          <thead>
            <tr>
              <th scope="col">{a.rubric}</th>
              <th scope="col" className="num">{data.year.label}</th>
              <th scope="col" className="num">{data.previousYear.label}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="accounts-section">
              <th scope="rowgroup" colSpan={3}>{a.income}</th>
            </tr>
            {incomeRubrics.map((k) => (
              <tr key={k}>
                <th scope="row">{a.rubrics[k]}</th>
                <td className="num">{money(fig.statement.income[k])}</td>
                <td className="num muted">{money(prev.statement.income[k])}</td>
              </tr>
            ))}
            <tr className="accounts-total">
              <th scope="row">{a.totalIncome}</th>
              <td className="num">{money(fig.statement.totalIn)}</td>
              <td className="num muted">{money(prev.statement.totalIn)}</td>
            </tr>
            <tr className="accounts-section">
              <th scope="rowgroup" colSpan={3}>{a.expenses}</th>
            </tr>
            {expenseRubrics.map((k) => (
              <tr key={k}>
                <th scope="row">{a.rubrics[k]}</th>
                <td className="num">{money(fig.statement.expenses[k])}</td>
                <td className="num muted">{money(prev.statement.expenses[k])}</td>
              </tr>
            ))}
            <tr className="accounts-total">
              <th scope="row">{a.totalExpenses}</th>
              <td className="num">{money(fig.statement.totalOut)}</td>
              <td className="num muted">{money(prev.statement.totalOut)}</td>
            </tr>
            <tr className="accounts-result">
              <th scope="row">{a.result}</th>
              <td className="num">{money(fig.statement.result)}</td>
              <td className="num muted">{money(prev.statement.result)}</td>
            </tr>
          </tbody>
        </DataTable>
      </Card>

      <Card title={fill(a.patrimony, { date: day(data.year.to) })} id="accounts-patrimony">
        <DataTable label={a.assets}>
          <thead>
            <tr>
              <th scope="col">{a.assets}</th>
              <th scope="col" className="num">{data.year.label}</th>
              <th scope="col" className="num">{data.previousYear.label}</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                [a.treasury, fig.assets.treasury, prev.assets.treasury],
                [a.receivableDues, fig.assets.dues, prev.assets.dues],
                [a.receivableGrants, fig.assets.grants, prev.assets.grants],
                [a.equipment, fig.assets.equipment, prev.assets.equipment],
              ] as const
            ).map(([label, now, before]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td className="num">{money(now)}</td>
                <td className="num muted">{money(before)}</td>
              </tr>
            ))}
            {(r?.manual ?? []).filter((m) => m.side === "asset").map((m, i) => (
              <tr key={"a" + i}>
                <th scope="row">
                  {m.label}
                  {m.comment && <span className="muted small"> · {m.comment}</span>}
                </th>
                <td className="num">{money(m.cents)}</td>
                <td className="num muted">…</td>
              </tr>
            ))}
            <tr className="accounts-total">
              <th scope="row">{a.totalAssets}</th>
              <td className="num">{money(fig.totalAssets)}</td>
              <td className="num muted">{money(prev.totalAssets)}</td>
            </tr>
            <tr className="accounts-section">
              <th scope="rowgroup" colSpan={3}>{a.debts}</th>
            </tr>
            {(r?.manual ?? []).filter((m) => m.side === "debt").map((m, i) => (
              <tr key={"d" + i}>
                <th scope="row">
                  {m.label}
                  {m.comment && <span className="muted small"> · {m.comment}</span>}
                </th>
                <td className="num">{money(m.cents)}</td>
                <td className="num muted">…</td>
              </tr>
            ))}
            <tr className="accounts-total">
              <th scope="row">{a.totalDebts}</th>
              <td className="num">{money(fig.totalDebts)}</td>
              <td className="num muted">{money(prev.totalDebts)}</td>
            </tr>
          </tbody>
        </DataTable>
      </Card>

      {editable ? (
        <DraftForm key={r?.id ?? "new"} locale={locale} data={data} busy={busy} save={(manual, commitments) => send({ action: "save", manual, commitments })} />
      ) : (
        <Card title={a.commitments} id="accounts-commitments">
          <p className="pre-line">{r?.commitments || "…"}</p>
        </Card>
      )}

      <Card title={a.checks} id="accounts-checks" className="no-print">
        <ul className="accounts-checks">
          {Object.entries(data.controls).map(([k, state]) => (
            <li key={k}>
              <Badge tone={checkTone[state]}>
                <Icon name={state === "ok" ? "check" : state === "fail" ? "alert" : "clock"} size={14} /> {a.checkStates[state]}
              </Badge>{" "}
              {a.checkNames[k]}
              {k === "categories" && state === "fail" && <span className="muted small"> · {fill(a.uncategorised, { n: fig.uncategorised })}</span>}
            </li>
          ))}
        </ul>
      </Card>

      <Card title={a.workflow} id="accounts-workflow" className="no-print">
        <p className="muted">{fill(a.deadlineAssembly, { date: day(data.deadlines.assembly) })}</p>
        {data.deadlines.filing && <p className="muted">{fill(a.deadlineFiling, { date: day(data.deadlines.filing) })}</p>}
        {r?.verified_on && <p>{fill(a.verifiedBy, { name: r.verified_name, date: day(r.verified_on) })}</p>}
        {r?.approved_on && <p>{fill(a.approvedOn, { date: day(r.approved_on) })}</p>}
        {r?.filed_on && <p>{fill(a.filedOn, { date: day(r.filed_on) })}</p>}
        {data.can.manage && <Workflow locale={locale} status={status} today={data.today} busy={busy} send={send} />}
      </Card>

      {data.can.manage && (
        <Card title={a.mapping} subtitle={a.mappingHint} id="accounts-mapping" className="no-print">
          <DataTable label={a.mapping}>
            <thead>
              <tr>
                <th scope="col">{a.category}</th>
                <th scope="col">{a.rubric}</th>
              </tr>
            </thead>
            <tbody>
              {data.mapping.map((m) => (
                <tr key={m.direction + m.category}>
                  <th scope="row">
                    {a.direction[m.direction]} · {f.categories[m.category] ?? m.category}
                  </th>
                  <td>
                    <select
                      aria-label={`${a.rubric} : ${a.direction[m.direction]} · ${f.categories[m.category] ?? m.category}`}
                      value={m.rubric}
                      disabled={busy}
                      data-nodirty=""
                      onChange={(e) => void post({ organizationId: data.organization_id, action: "mapping", direction: m.direction, category: m.category, rubric: e.target.value }, a.saved)}
                    >
                      {(m.direction === "in" ? incomeRubrics : expenseRubrics).map((k) => (
                        <option key={k} value={k}>
                          {a.rubrics[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      )}

      <section className="print-only accounts-signatures" aria-label={a.signatures}>
        <p>
          <strong>{a.forBoard}</strong>
        </p>
        <div className="signature-boxes">
          <div />
          <div />
        </div>
      </section>
    </main>
  );
}

/** Manual lines and the rights and commitments, while the accounts are a draft. */
function DraftForm({ locale, data, busy, save }: { locale: Locale; data: View; busy: boolean; save: (manual: ManualLine[], commitments: string) => Promise<boolean> }) {
  const a = accountsCopy[locale];
  const [lines, setLines] = useState<(ManualLine & { key: string })[]>(() => (data.record?.manual ?? []).map((m, i) => ({ ...m, key: String(i) })));
  const [commitments, setCommitments] = useState(data.record?.commitments ?? "");
  const money = (c: number) => formatCents(c, locale);
  const suggestions = [
    ...data.suggestions.loans.map((name) => fill(a.loanSuggestion, { name })),
    ...data.suggestions.partners.map((x) => fill(a.partnerSuggestion, { name: x.name, date: x.ends_on, amount: money(x.amount_cents) })),
    // 9: the reserved funds left at the closing are a commitment of the association.
    ...data.reserved.items.map((x) => fill(a.reservedSuggestion, { name: x.label, amount: money(x.remaining) })),
  ].filter((s) => !commitments.includes(s));
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void save(
      lines.filter((l) => l.label.trim().length >= 2).map(({ side, label, cents, comment }) => ({ side, label: label.trim(), cents, comment })),
      commitments,
    );
  };
  return (
    <form onSubmit={submit} className="accounts-draft no-print">
      <Card title={a.manualLines} subtitle={a.manualHint} id="accounts-manual">
        {lines.length > 0 && (
          <ul className="accounts-lines">
            {lines.map((l, i) => (
              <li key={l.key}>
                <label>
                  {a.side}
                  <select value={l.side} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, side: e.target.value as "asset" | "debt" } : y)))}>
                    <option value="asset">{a.sides.asset}</option>
                    <option value="debt">{a.sides.debt}</option>
                  </select>
                </label>
                <label>
                  {a.label}
                  <input value={l.label} maxLength={160} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
                </label>
                <label>
                  {a.amount}
                  <input
                    inputMode="decimal"
                    defaultValue={l.cents ? String(l.cents / 100) : ""}
                    onChange={(e) => {
                      const cents = Math.round(Number(e.target.value.replace(",", ".") || 0) * 100);
                      setLines((x) => x.map((y, j) => (j === i ? { ...y, cents: Number.isFinite(cents) && cents >= 0 ? cents : 0 } : y)));
                    }}
                  />
                </label>
                <label>
                  {a.comment}
                  <input value={l.comment} maxLength={500} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, comment: e.target.value } : y)))} />
                </label>
                <button type="button" className="text-button danger" onClick={() => setLines((x) => x.filter((_, j) => j !== i))}>
                  {a.remove}
                  <span className="sr-only"> : {l.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" variant="secondary" icon="plus" onClick={() => setLines((x) => [...x, { key: String(Date.now()), side: "debt", label: "", cents: 0, comment: "" }])}>
          {a.addLine}
        </Button>
      </Card>
      <Card title={a.commitments} subtitle={a.commitmentsHint} id="accounts-commitments">
        <label className="sr-only" htmlFor="accounts-commitments-text">
          {a.commitments}
        </label>
        <textarea id="accounts-commitments-text" rows={4} maxLength={8000} value={commitments} onChange={(e) => setCommitments(e.target.value)} />
        {suggestions.length > 0 && (
          <div className="accounts-suggestions">
            <p className="muted small">{a.suggestions}</p>
            <ul className="plain-list">
              {suggestions.map((s) => (
                <li key={s}>
                  {s}{" "}
                  <button type="button" className="text-button" onClick={() => setCommitments((c) => (c ? `${c}\n${s}` : s))}>
                    {a.addSuggestion}
                    <span className="sr-only"> : {s}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="actions">
          <Button disabled={busy}>{a.save}</Button>
        </div>
      </Card>
    </form>
  );
}

/** Verify, approve at the assembly, file; back to the draft or a new version. */
function Workflow({ locale, status, today, busy, send }: { locale: Locale; status: string; today: string; busy: boolean; send: (body: Record<string, unknown>) => Promise<boolean> }) {
  const a = accountsCopy[locale];
  const form = (action: string, fields: (d: FormData) => Record<string, unknown>) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void send({ action, ...fields(new FormData(e.currentTarget)) });
  };
  if (status === "draft")
    return (
      <form className="accounts-step" onSubmit={form("verify", (d) => ({ name: String(d.get("name") ?? ""), on: String(d.get("on") ?? today) }))}>
        <label>
          {a.verifierName}
          <input name="name" required minLength={2} maxLength={120} autoComplete="name" />
        </label>
        <label>
          {a.verifiedDate}
          <input name="on" type="date" required defaultValue={today} />
        </label>
        <Button disabled={busy}>{a.verify}</Button>
      </form>
    );
  if (status === "verified")
    return (
      <div className="accounts-steps">
        <form className="accounts-step" onSubmit={form("approve", (d) => ({ on: String(d.get("on") ?? today) }))}>
          <label>
            {a.assemblyDate}
            <input name="on" type="date" required defaultValue={today} />
          </label>
          <Button disabled={busy}>{a.approve}</Button>
        </form>
        <Button variant="secondary" disabled={busy} onClick={() => void send({ action: "reopen" })}>
          {a.reopen}
        </Button>
      </div>
    );
  return (
    <div className="accounts-steps">
      {status === "approved" && (
        <form className="accounts-step" onSubmit={form("file", (d) => ({ on: String(d.get("on") ?? today) }))}>
          <label>
            {a.filedDate}
            <input name="on" type="date" required defaultValue={today} />
          </label>
          <Button disabled={busy}>{a.file}</Button>
        </form>
      )}
      <Button variant="secondary" disabled={busy} onClick={() => void send({ action: "reopen" })}>
        {a.correct}
      </Button>
    </div>
  );
}
