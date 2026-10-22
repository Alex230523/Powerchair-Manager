"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { financeView } from "@/domains/finance/service";
import { budgetTone, categories, methods } from "@/domains/finance/schema";
import { cssVars } from "./css-vars";
import { financeCopy, financeExtras } from "./finance-copy";
import { errors } from "./access-copy";
import { Icon } from "./icons";
import { ShowMore, useShowMore } from "./use-api";
import { PageHeader, Badge, Button, EmptyState, Card, ExportButton, KpiCard, Toolbar } from "./ui";
import { useScope } from "./use-scope";
import { Modal } from "./modal";
import { setupCopy } from "./setup-copy";
import { useRouter } from "next/navigation";
import { FinanceNav } from "./finance-nav";
import { MoreMenu } from "./more-menu";
import { financeSectionsCopy } from "./finance-sections-copy";
import { undoToast } from "./toast";

type View = Awaited<ReturnType<typeof financeView>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

/**
 * `create` opens the "add an operation" form at once (the "Créer" menu of the home page).
 * Wave 17 (N1): one « Finances » page in tabs; this component draws the
 * overview, the operations (the ledger) and the budget.
 */
export function Finance({ locale, create = false, section = "overview" }: { locale: Locale; create?: boolean; section?: "overview" | "operations" | "budget" }) {
  const t = financeCopy[locale],
    x = financeExtras[locale],
    n = financeSectionsCopy[locale];
  const router = useRouter();
  const [view, setView] = useState<View | null>(null),
    [denied, setDenied] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [adding, setAdding] = useState(create),
    [cancelling, setCancelling] = useState(""),
    [q, setQ] = useState(""),
    [direction, setDirection] = useState(""),
    [category, setCategory] = useState(""),
    [editingBudget, setEditingBudget] = useState(false),
    [kind, setKind] = useState<"in" | "out">("out"),
    [deleting, setDeleting] = useState<View["entries"][number] | null>(null);
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

  // The team chosen in the top bar (wave 12) narrows the ledger, the budget and the figures.
  const scope = useScope();
  const scopedUrl = "/api/finance" + (scope.teamId ? `?team=${scope.teamId}` : "");
  async function load() {
    const r = await fetch(scopedUrl, { cache: "no-store" });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setView(v);
  }
  useEffect(() => {
    let cancelled = false;
    fetch(scopedUrl, { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (cancelled) return;
        if (r.ok) setView(v);
        else if (
          [
            "FORBIDDEN",
            "MFA_REQUIRED",
            "CLUB_ONLY",
            "CONTEXT_REQUIRED",
            "UNAUTHENTICATED",
          ].includes(v.error)
        )
          setDenied(true);
        else setError(errors[v.error]?.[locale] ?? v.error);
      })
      .catch(() => {
        if (!cancelled) setDenied(true);
      });
    return () => {
      cancelled = true;
    };
  }, [locale, scopedUrl]);

  /** The server's answer (an id, an undo offer), or null when it failed. */
  async function sendFor(body: Record<string, unknown>): Promise<{ id?: string; undo?: string } | null> {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          organizationId: view?.organization_id,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await load();
      setMessage(t.saved);
      return v;
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(errors[code]?.[locale] ?? code);
      return null;
    } finally {
      setBusy(false);
    }
  }
  const send = async (body: Record<string, unknown>) => (await sendFor(body)) !== null;
  function record(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const value = (k: string) => String(f.get(k) ?? "").trim();
    const receivableId = value("receivable") || null;
    const receipt = f.get("receipt");
    void sendFor({
      action: "record",
      occurredOn: value("date"),
      label: value("label"),
      // A dues payment is always an income of the "dues" category.
      direction: receivableId ? "in" : value("direction"),
      category: receivableId ? "dues" : value("category"),
      receivableId,
      tripId: value("trip") || null,
      teamId: value("team") || null,
      amountCents: Math.round(Number(value("amount").replace(",", ".")) * 100),
      method: value("method"),
      counterparty: value("counterparty"),
      reference: value("reference"),
      notes: value("notes"),
    }).then(async (r) => {
      if (!r) return;
      setAdding(false);
      // The receipt chosen in the form follows the new line.
      if (r.id && receipt instanceof File && receipt.size > 0) await attach(r.id, receipt);
    });
  }

  async function attach(transactionId: string, file: File) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const d = new FormData();
      d.set("file", file);
      d.set("organizationId", view?.organization_id ?? "");
      const r = await fetch("/api/finance/receipt/" + transactionId, {
        method: "POST",
        body: d,
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await load();
      setMessage(x.attached);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(errors[code]?.[locale] ?? code);
    } finally {
      setBusy(false);
    }
  }
  function saveBudget(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const lines = (["in", "out"] as const).flatMap((direction) =>
      categories.map((c) => ({
        direction,
        category: c,
        amountCents: Math.round(
          Number(
            String(f.get(`${direction}-${c}`) ?? "0").replace(",", ".") || 0,
          ) * 100,
        ),
      })),
    );
    void send({ action: "budget", season: view?.season.label, teamId: view?.teamId ?? null, lines }).then(
      (ok) => {
        if (ok) {
          setEditingBudget(false);
          setMessage(x.budgetSaved);
        }
      },
    );
  }
  const entries =
    view?.entries.filter(
      (e) =>
        (!direction || e.direction === direction) &&
        (!category || e.category === category) &&
        [e.label, e.counterparty, e.reference]
          .join(" ")
          .toLocaleLowerCase()
          .includes(q.toLocaleLowerCase()),
    ) ?? [];
  const { visible: shownEntries, more: moreEntries } = useShowMore(entries);
  function exportCsv() {
    const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [
      [
        t.date,
        t.label,
        t.direction,
        t.category,
        t.amount,
        t.method,
        t.counterparty,
        t.reference,
        t.cancelled,
      ],
      ...entries.map((e) => [
        e.occurred_on,
        e.label,
        e.direction === "in" ? t.in : t.out,
        t.categories[e.category] ?? e.category,
        (((e.direction === "in" ? 1 : -1) * e.amount_cents) / 100).toFixed(2),
        t.methods[e.method] ?? e.method,
        e.counterparty,
        e.reference,
        e.cancelled_at ? t.cancelled : "",
      ]),
    ];
    const blob = new Blob(
      ["﻿" + rows.map((r) => r.map(cell).join(";")).join("\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tresorerie-${view?.season.label ?? ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const s = view?.summary;
  const categoryRows = s
    ? Object.entries(s.byCategory).sort(
        (a, b) => b[1].in + b[1].out - (a[1].in + a[1].out),
      )
    : [];
  const biggest = Math.max(
    1,
    ...categoryRows.map(([, v]) => Math.max(v.in, v.out)),
  );

  return (
    <main id="main" className="access finance">
      <PageHeader
        title={t.title}
        subtitle={t.intro}
        actions={
          view && (
            <>
              {view.can_edit && (
                <Button icon="plus" aria-expanded={adding} onClick={() => setAdding(true)}>
                  {n.add}
                </Button>
              )}
              <MoreMenu
                label={n.more}
                items={[
                  { label: n.export, run: exportCsv, hidden: !entries.length },
                  { label: n.annualReport, run: () => router.push(`/${locale}/funding/report?season=${view.season.label}`) },
                ]}
              />
            </>
          )
        }
      />
      <FinanceNav locale={locale} current={section} />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {denied && <p className="notice">{t.restricted}</p>}
      {view && !view.can_edit && <p className="notice">{x.readOnly}</p>}

      {view && s && (
        <>
          {section === "overview" && (
          <ul className="stat-row-grid" data-cols="4">
            <li>
              <KpiCard label={t.balance} value={money(s.balance)} description={t.balanceHint} icon="funding" tone={s.balance < 0 ? "danger" : "primary"} />
            </li>
            <li>
              <KpiCard label={`${t.income} · ${t.season} ${view.season.label}`} value={money(s.income)} icon="arrow" tone="success" />
            </li>
            <li>
              <KpiCard label={`${t.expenses} · ${t.season} ${view.season.label}`} value={money(s.expenses)} description={`${s.result >= 0 ? "+" : ""}${money(s.result)}`} icon="dues" tone="danger" />
            </li>
            <li>
              <KpiCard label={n.next30} value={money(view.dues.next30)} description={n.next30Hint} icon="calendar" />
            </li>
          </ul>
          )}

          {adding && (
            <Modal title={t.add} close={() => setAdding(false)}>
              <form onSubmit={record} className="finance-form">
                <div className="form-pair">
                  <label htmlFor="fin-date">
                    {t.date}
                    <input
                      id="fin-date"
                      name="date"
                      type="date"
                      required
                      max={view.today}
                      defaultValue={view.today}
                    />
                  </label>
                </div>
                <fieldset className="kind-choice">
                  <legend>{n.kind}</legend>
                  {(["out", "in"] as const).map((k) => (
                    <label key={k} className="kind-option" data-kind={k}>
                      <input type="radio" name="direction" value={k} checked={kind === k} onChange={() => setKind(k)} />
                      <Icon name={k === "out" ? "dues" : "funding"} size={22} />
                      <span>{k === "out" ? n.expense : n.income}</span>
                    </label>
                  ))}
                </fieldset>
                <label htmlFor="fin-label">
                  {t.label}
                  <input
                    id="fin-label"
                    name="label"
                    required
                    minLength={2}
                    maxLength={160}
                  />
                </label>
                <div className="form-pair">
                  <label htmlFor="fin-amount">
                    {t.amount}
                    <input
                      id="fin-amount"
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      max="1000000"
                      required
                    />
                  </label>
                  <label htmlFor="fin-category">
                    {t.category}
                    <select
                      id="fin-category"
                      name="category"
                      defaultValue="dues"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {t.categories[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor="fin-method">
                    {t.method}
                    <select
                      id="fin-method"
                      name="method"
                      defaultValue="transfer"
                    >
                      {methods.map((m) => (
                        <option key={m} value={m}>
                          {t.methods[m]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="form-pair">
                  <label htmlFor="fin-counterparty">
                    {t.counterparty}
                    <input
                      id="fin-counterparty"
                      name="counterparty"
                      maxLength={160}
                    />
                  </label>
                  <label htmlFor="fin-reference">
                    {t.reference}
                    <input
                      id="fin-reference"
                      name="reference"
                      maxLength={160}
                    />
                  </label>
                </div>
                {view.receivables.length > 0 && (
                  <label htmlFor="fin-receivable">
                    {x.payment}
                    <select
                      id="fin-receivable"
                      name="receivable"
                      defaultValue=""
                      aria-describedby="fin-receivable-hint"
                    >
                      <option value="">{x.paymentNone}</option>
                      {view.receivables.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.full_name} · {r.category} · {x.left}{" "}
                          {money(Math.max(0, r.net_cents - r.paid_cents))}
                        </option>
                      ))}
                    </select>
                    <span id="fin-receivable-hint" className="muted">
                      {x.paymentHint}
                    </span>
                  </label>
                )}
                {view.teams.length > 0 && (
                  <label htmlFor="fin-team">
                    {x.team}
                    <select id="fin-team" name="team" defaultValue={view.teamId ?? ""}>
                      <option value="">{x.wholeClub}</option>
                      {view.teams.map((tm) => (
                        <option key={tm.id} value={tm.id}>{tm.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                {view.trips.length > 0 && (
                  <label htmlFor="fin-trip">
                    {x.trip}
                    <select id="fin-trip" name="trip" defaultValue="">
                      <option value="">{x.tripNone}</option>
                      {view.trips.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {tr.title} · {day(tr.starts_on)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label htmlFor="fin-notes">
                  {t.notes}
                  <textarea id="fin-notes" name="notes" maxLength={2000} />
                </label>
                <label htmlFor="fin-receipt">
                  {n.receipt}
                  <input id="fin-receipt" name="receipt" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" aria-describedby="fin-receipt-hint" />
                  <span id="fin-receipt-hint" className="muted">
                    {n.receiptHint}
                  </span>
                </label>
                <button className="button" disabled={busy}>
                  {t.save}
                </button>
              </form>
            </Modal>
          )}

          {section === "overview" && categoryRows.length > 0 && (
            <Card title={<>{t.byCategory} · {t.season} {view.season.label}</>} labelledBy="finance-categories" headingId="finance-categories">
              <ul className="category-bars">
                {categoryRows.map(([key, v]) => (
                  <li key={key}>
                    <span>{t.categories[key] ?? key}</span>
                    <span className="bar-pair" aria-hidden="true">
                      <span
                        className="bar in"
                        style={cssVars({ value: Math.round((v.in / biggest) * 1000) / 10 })}
                      />
                      <span
                        className="bar out"
                        style={cssVars({ value: Math.round((v.out / biggest) * 1000) / 10 })}
                      />
                    </span>
                    <span className="bar-values">
                      {v.in > 0 && (
                        <span className="amount-in">+{money(v.in)}</span>
                      )}
                      {v.out > 0 && (
                        <span className="amount-out">−{money(v.out)}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {section !== "operations" && (
          <Card title={<>{x.budget} · {view.season.label}
                {view.teamId && <span className="muted"> · {view.teams.find((tm) => tm.id === view.teamId)?.name}</span>}</>} labelledBy="finance-budget" headingId="finance-budget" actions={section === "budget" && (
                <>
                <ExportButton
                  locale={locale}
                  organizationId={view.organization_id}
                  dataset="budget"
                  subject={x.budget}
                  period={view.season.label}
                  rows={view.comparison}
                  columns={[
                    { id: "category", label: t.category, value: (r) => t.categories[r.category] ?? r.category },
                    { id: "direction", label: t.direction, value: (r) => (r.direction === "in" ? t.in : t.out) },
                    { id: "planned", label: x.planned, type: "money", value: (r) => (r.planned ?? 0) / 100 },
                    { id: "actual", label: x.actual, type: "money", value: (r) => r.actual / 100 },
                    { id: "ratio", label: `${x.progress} (%)`, type: "number", value: (r) => r.ratio },
                    { id: "gap", label: x.gap, type: "money", value: (r) => (r.planned ? r.gap / 100 : null) },
                  ]}
                />
                {view.can_edit && (
                <button
                  type="button"
                  className="button secondary"
                  aria-expanded={editingBudget}
                  onClick={() => setEditingBudget(!editingBudget)}
                >
                  {editingBudget ? t.close : x.editBudget}
                </button>
                )}
                </>
              )}>
            <p className="muted">{x.budgetIntro}</p>
            {editingBudget ? (
              <form className="budget-form" onSubmit={saveBudget}>
                {(["in", "out"] as const).map((direction) => (
                  <fieldset key={direction}>
                    <legend>{direction === "in" ? t.in : t.out}</legend>
                    {categories.map((c) => (
                      <label key={c} htmlFor={`budget-${direction}-${c}`}>
                        {t.categories[c]}
                        <input
                          id={`budget-${direction}-${c}`}
                          name={`${direction}-${c}`}
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          defaultValue={
                            (view.budget.find(
                              (l) =>
                                l.direction === direction && l.category === c,
                            )?.amount_cents ?? 0) / 100 || ""
                          }
                        />
                      </label>
                    ))}
                  </fieldset>
                ))}
                <button className="button" disabled={busy}>
                  {x.saveBudget}
                </button>
              </form>
            ) : view.comparison.length ? (
              <div
                className="table-scroll"
                role="region"
                aria-label={x.budget}
                tabIndex={0}
              >
                <table className="ledger budget-table">
                  <thead>
                    <tr>
                      <th scope="col">{t.category}</th>
                      <th scope="col">{t.direction}</th>
                      <th scope="col" className="num">
                        {x.actual} / {x.planned}
                      </th>
                      <th scope="col">{x.progress}</th>
                      <th scope="col" className="num">
                        {x.gap}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.comparison.map((r) => (
                      <tr key={r.direction + r.category}>
                        <td>{t.categories[r.category] ?? r.category}</td>
                        <td>{r.direction === "in" ? t.in : t.out}</td>
                        <td className="num">
                          {r.planned ? x.ofBudget.replace("{actual}", money(r.actual)).replace("{planned}", money(r.planned)) : money(r.actual)}
                        </td>
                        <td>
                          {r.ratio !== null ? (
                            <span className="budget-progress" data-tone={budgetTone(r.direction, r.ratio)}>
                              <span className="budget-meter" aria-hidden="true">
                                <span style={cssVars({ value: Math.min(r.ratio, 100) })} />
                              </span>
                              <span className="budget-pct">
                                {r.ratio} % {x.used}
                              </span>
                            </span>
                          ) : (
                            <span className="muted">…</span>
                          )}
                        </td>
                        <td
                          className={
                            "num " + (r.gap >= 0 ? "amount-in" : "amount-out")
                          }
                        >
                          {r.planned
                            ? (r.gap >= 0 ? "+" : "−") + money(Math.abs(r.gap))
                            : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title={x.noBudget} />
            )}
          </Card>
          )}
          {section === "overview" && (
            <Card title={n.last} labelledBy="finance-last" headingId="finance-last" actions={<Link href={`/${locale}/funding/operations`}>{n.seeAll} →</Link>}>
              {view.entries.filter((e) => !e.cancelled_at).length ? (
                <ul className="last-operations">
                  {view.entries
                    .filter((e) => !e.cancelled_at)
                    .slice(0, 5)
                    .map((e) => (
                      <li key={e.id}>
                        <span className="muted">{day(e.occurred_on)}</span>
                        <strong>{e.label}</strong>
                        <span className={e.direction === "in" ? "amount-in" : "amount-spent"}>
                          {e.direction === "in" ? "+" : "−"}
                          {money(e.amount_cents)}
                        </span>
                      </li>
                    ))}
                </ul>
              ) : (
                <EmptyState title={t.empty} />
              )}
            </Card>
          )}

          {section === "operations" && (
          <section aria-labelledby="finance-history">
            <h2 id="finance-history">{t.history}</h2>
            <Toolbar label={x.ledgerFilters}>
              <label>
                {t.search}
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <label>
                {t.direction}
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                >
                  <option value="">{t.all}</option>
                  <option value="in">{t.in}</option>
                  <option value="out">{t.out}</option>
                </select>
              </label>
              <label>
                {t.category}
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">{t.all}</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {t.categories[c]}
                    </option>
                  ))}
                </select>
              </label>
              {/* Wave 17 (G2): the operations shown, with their filters. */}
              <ExportButton
                locale={locale}
                organizationId={view.organization_id}
                dataset="operations"
                subject={x.operationsWord}
                period={view.season.label}
                rows={entries}
                columns={[
                  { id: "date", label: t.date, type: "date", value: (e) => e.occurred_on },
                  { id: "label", label: t.label, value: (e) => e.label },
                  { id: "direction", label: t.direction, value: (e) => (e.direction === "in" ? t.in : t.out) },
                  { id: "category", label: t.category, value: (e) => t.categories[e.category] ?? e.category },
                  { id: "team", label: x.teamWord, value: (e) => e.team_name ?? "" },
                  { id: "amount", label: t.amount, type: "money", value: (e) => ((e.direction === "in" ? 1 : -1) * e.amount_cents) / 100 },
                  { id: "method", label: t.method, value: (e) => t.methods[e.method] ?? e.method },
                  { id: "counterparty", label: t.counterparty, value: (e) => e.counterparty },
                  { id: "reference", label: t.reference, value: (e) => e.reference },
                  { id: "cancelled", label: t.cancelled, value: (e) => (e.cancelled_at ? t.cancelled : "") },
                ]}
              />
            </Toolbar>
            {entries.length ? (
              <div
                className="table-scroll"
                role="region"
                aria-label={t.history}
                tabIndex={0}
              >
                <table className="ledger">
                  <thead>
                    <tr>
                      <th scope="col">{t.date}</th>
                      <th scope="col">{t.label}</th>
                      <th scope="col">{t.category}</th>
                      <th scope="col">{t.method}</th>
                      <th scope="col" className="num">
                        {t.amount}
                      </th>
                      <th scope="col">{x.receipts}</th>
                      <th scope="col">
                        <span className="sr-only">{t.cancel}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownEntries.map((e) => (
                      <tr
                        key={e.id}
                        data-cancelled={e.cancelled_at ? true : undefined}
                      >
                        <td>{day(e.occurred_on)}</td>
                        <td>
                          <strong>{e.label}</strong>
                          {e.team_name && (
                            <>
                              {" "}
                              <span className="team-chip" data-color={e.team_color ?? "none"}>
                                <span className="team-dot" aria-hidden="true" />
                                {e.team_name}
                              </span>
                            </>
                          )}
                          {(e.counterparty || e.reference) && (
                            <span className="muted">
                              {" "}
                              ·{" "}
                              {[e.counterparty, e.reference]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                          {e.cancelled_at && (
                            <Badge tone="danger">
                              {t.cancelled}
                            </Badge>
                          )}
                        </td>
                        <td>
                          <Badge tone="neutral">{t.categories[e.category] ?? e.category}</Badge>
                        </td>
                        <td>{t.methods[e.method] ?? e.method}</td>
                        <td className={"num " + (e.direction === "in" ? "amount-in" : "amount-spent")}>
                          {e.direction === "in" ? "+" : "−"}
                          {money(e.amount_cents)}
                        </td>
                        <td>
                          <ul className="receipt-list">
                            {e.receipts.map((r) => (
                              <li key={r.id}>
                                <a
                                  href={`/api/finance/receipt/${r.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {r.filename}
                                </a>
                                {view.can_edit && <button
                                  type="button"
                                  className="text-button"
                                  disabled={busy}
                                  aria-label={`${x.removeReceipt} : ${r.filename}`}
                                  onClick={() =>
                                    void send({
                                      action: "removeReceipt",
                                      id: r.id,
                                    })
                                  }
                                >
                                  ×
                                </button>}
                              </li>
                            ))}
                          </ul>
                          {!e.cancelled_at && view.can_edit && (
                            <label className="text-button file-button">
                              {x.attach}
                              <span className="sr-only">
                                {" "}
                                : {x.attachLabel}, {e.label}
                              </span>
                              <input
                                type="file"
                                accept="application/pdf,image/png,image/jpeg,image/webp"
                                disabled={busy}
                                onChange={(ev) => {
                                  const file = ev.target.files?.[0];
                                  if (file) void attach(e.id, file);
                                  ev.target.value = "";
                                }}
                              />
                            </label>
                          )}
                        </td>
                        <td className="ledger-actions">
                          {!e.cancelled_at &&
                            view.can_edit &&
                            (cancelling === e.id ? (
                              <form
                                className="inline-form"
                                onSubmit={(ev) => {
                                  ev.preventDefault();
                                  const reason = String(
                                    new FormData(ev.currentTarget).get(
                                      "reason",
                                    ) ?? "",
                                  );
                                  void send({
                                    action: "cancel",
                                    id: e.id,
                                    reason,
                                  }).then((ok) => ok && setCancelling(""));
                                }}
                              >
                                <label>
                                  <span className="sr-only">
                                    {t.cancelReason}
                                  </span>
                                  <input
                                    name="reason"
                                    required
                                    minLength={5}
                                    maxLength={500}
                                    placeholder={t.cancelReason}
                                  />
                                </label>
                                <button
                                  className="button secondary"
                                  disabled={busy}
                                >
                                  {t.confirmCancel}
                                </button>
                              </form>
                            ) : (
                              <button
                                type="button"
                                className="text-button"
                                aria-label={`${t.cancel} : ${e.label}`}
                                onClick={() => setCancelling(e.id)}
                              >
                                {t.cancel}
                              </button>
                            ))}
                          {view.can_edit && (
                            <button type="button" className="icon-button sm" aria-label={n.deleteOf.replace("{label}", e.label)} title={n.deleteOf.replace("{label}", e.label)} disabled={busy} onClick={() => setDeleting(e)}>
                              <Icon name="trash" size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {entries.length ? (
              <ShowMore locale={locale} {...moreEntries} />
            ) : (
              <EmptyState
                title={t.empty}
                action={
                  view.can_edit && (
                    <button className="button" type="button" onClick={() => setAdding(true)}>
                      {setupCopy[locale].empty.finance}
                    </button>
                  )
                }
              />
            )}
          </section>
          )}
        </>
      )}
      {deleting && view && (
        <Modal title={deleting.origin ? n.linkedTitle : n.deleteTitle.replace("{label}", deleting.label)} close={() => setDeleting(null)}>
          {deleting.origin ? (
            <>
              <p>{n.linked[deleting.origin]}</p>
              <div className="actions">
                <Link className="button" href={`/${locale}${deleting.origin === "dues" ? "/dues" : deleting.origin === "sponsor" ? "/funding/partners" : "/funding/affiliations"}`}>
                  {n.open}
                </Link>
                <button type="button" className="button secondary" onClick={() => setDeleting(null)}>
                  {n.cancel}
                </button>
              </div>
            </>
          ) : (
            <form
              className="stack-form"
              onSubmit={(ev) => {
                ev.preventDefault();
                const reason = String(new FormData(ev.currentTarget).get("reason") ?? "").trim();
                const line = deleting;
                void sendFor({ action: "delete", id: line.id, reason }).then((r) => {
                  if (!r) return;
                  setDeleting(null);
                  undoToast(locale, n.deleted, r.undo, view.organization_id, load, "trash");
                });
              }}
            >
              <p>
                {n.deleteText} <strong>{(deleting.direction === "in" ? "+" : "−") + money(deleting.amount_cents)}</strong>
              </p>
              <label htmlFor="delete-reason">
                {n.deleteReason}
                <input id="delete-reason" name="reason" required minLength={3} maxLength={500} />
              </label>
              <div className="actions">
                <button className="button danger" disabled={busy}>
                  {n.deleteConfirm}
                </button>
                <button type="button" className="button secondary" onClick={() => setDeleting(null)}>
                  {n.cancel}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

    </main>
  );
}
