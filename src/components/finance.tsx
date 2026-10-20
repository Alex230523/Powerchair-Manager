"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { financeView } from "@/domains/finance/service";
import { categories, methods } from "@/domains/finance/schema";
import { financeCopy, financeExtras } from "./finance-copy";
import { errors } from "./access-copy";
import { Icon } from "./icons";
import { ShowMore, useShowMore } from "./use-api";
import { PageHeader } from "./ui";
import { Modal } from "./modal";

type View = Awaited<ReturnType<typeof financeView>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

export function Finance({ locale }: { locale: Locale }) {
  const t = financeCopy[locale],
    x = financeExtras[locale];
  const [view, setView] = useState<View | null>(null),
    [denied, setDenied] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [adding, setAdding] = useState(false),
    [cancelling, setCancelling] = useState(""),
    [q, setQ] = useState(""),
    [direction, setDirection] = useState(""),
    [category, setCategory] = useState(""),
    [editingBudget, setEditingBudget] = useState(false),
    [reportSeason, setReportSeason] = useState("");
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

  async function load() {
    const r = await fetch("/api/finance", { cache: "no-store" });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setView(v);
  }
  useEffect(() => {
    let cancelled = false;
    fetch("/api/finance", { cache: "no-store" })
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
  }, [locale]);

  async function send(body: Record<string, unknown>) {
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
      return true;
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(errors[code]?.[locale] ?? code);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function record(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const value = (k: string) => String(f.get(k) ?? "").trim();
    const receivableId = value("receivable") || null;
    void send({
      action: "record",
      occurredOn: value("date"),
      label: value("label"),
      // A dues payment is always an income of the "dues" category.
      direction: receivableId ? "in" : value("direction"),
      category: receivableId ? "dues" : value("category"),
      receivableId,
      tripId: value("trip") || null,
      amountCents: Math.round(Number(value("amount").replace(",", ".")) * 100),
      method: value("method"),
      counterparty: value("counterparty"),
      reference: value("reference"),
      notes: value("notes"),
    }).then((ok) => ok && setAdding(false));
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
    void send({ action: "budget", season: view?.season.label, lines }).then(
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
              <Link className="button secondary" href={`/${locale}/dues`}>
                {t.dues}
              </Link>
              <Link className="button secondary" href={`/${locale}/funding/report?season=${view.season.label}`}>
                {x.report}
              </Link>
              <button className="button secondary" type="button" onClick={exportCsv} disabled={!entries.length}>
                {t.export}
              </button>
              {view.can_edit && (
                <button className="button" type="button" aria-expanded={adding} onClick={() => setAdding(!adding)}>
                  {adding ? t.close : t.add}
                </button>
              )}
            </>
          )
        }
      />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {denied && <p className="notice">{t.restricted}</p>}
      {view && !view.can_edit && <p className="notice">{x.readOnly}</p>}

      {view && s && (
        <>
          <ul className="finance-cards">
            <li data-tone={s.balance < 0 ? "danger" : "accent"}>
              <span className="metric-label">{t.balance}</span>
              <span className="metric-value">{money(s.balance)}</span>
              <span className="metric-hint">{t.balanceHint}</span>
            </li>
            <li data-tone="success">
              <span className="metric-label">
                {t.income} · {t.season} {view.season.label}
              </span>
              <span className="metric-value">{money(s.income)}</span>
            </li>
            <li data-tone="danger">
              <span className="metric-label">
                {t.expenses} · {t.season} {view.season.label}
              </span>
              <span className="metric-value">{money(s.expenses)}</span>
              <span className="metric-hint">
                {s.result >= 0 ? "+" : ""}
                {money(s.result)}
              </span>
            </li>
            <li>
              <span className="metric-label">
                {t.duesPlanned} · {t.season} {view.season.label}
              </span>
              <span className="metric-value">{money(view.dues.season)}</span>
              <span className="metric-hint">
                {t.duesHint.replace("{amount}", money(view.dues.next30))}
                {view.dues.collected > 0 &&
                  ` · ${x.collected.replace("{amount}", money(view.dues.collected))}`}
              </span>
            </li>
          </ul>
          <p className="notice">{t.bankNote}</p>

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
                  <label htmlFor="fin-direction">
                    {t.direction}
                    <select
                      id="fin-direction"
                      name="direction"
                      defaultValue="in"
                    >
                      <option value="in">{t.in}</option>
                      <option value="out">{t.out}</option>
                    </select>
                  </label>
                </div>
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
                <button className="button" disabled={busy}>
                  {t.save}
                </button>
              </form>
            </Modal>
          )}

          {categoryRows.length > 0 && (
            <section className="panel" aria-labelledby="finance-categories">
              <h2 id="finance-categories">
                {t.byCategory} · {t.season} {view.season.label}
              </h2>
              <ul className="category-bars">
                {categoryRows.map(([key, v]) => (
                  <li key={key}>
                    <span>{t.categories[key] ?? key}</span>
                    <span className="bar-pair" aria-hidden="true">
                      <span
                        className="bar in"
                        style={{ width: `${(v.in / biggest) * 100}%` }}
                      />
                      <span
                        className="bar out"
                        style={{ width: `${(v.out / biggest) * 100}%` }}
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
            </section>
          )}

          <section className="panel" aria-labelledby="finance-budget">
            <div className="panel-head">
              <h2 id="finance-budget">
                {x.budget} · {view.season.label}
              </h2>
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
            </div>
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
                    {view.comparison.map((r) => (
                      <tr key={r.direction + r.category}>
                        <td>{t.categories[r.category] ?? r.category}</td>
                        <td>{r.direction === "in" ? t.in : t.out}</td>
                        <td className="num">
                          {r.planned ? money(r.planned) : ""}
                        </td>
                        <td className="num">
                          {money(r.actual)}
                          {r.ratio !== null && (
                            <span className="muted">
                              {" "}
                              · {r.ratio} % {x.used}
                            </span>
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
              <p className="muted">{x.noBudget}</p>
            )}
          </section>

          <section aria-labelledby="finance-history">
            <h2 id="finance-history">{t.history}</h2>
            <form
              className="directory-filters"
              onSubmit={(e) => e.preventDefault()}
            >
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
            </form>
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
                            <span className="status-tag" data-tone="danger">
                              {t.cancelled}
                            </span>
                          )}
                        </td>
                        <td>{t.categories[e.category] ?? e.category}</td>
                        <td>{t.methods[e.method] ?? e.method}</td>
                        <td
                          className={
                            "num " +
                            (e.direction === "in" ? "amount-in" : "amount-out")
                          }
                        >
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
                        <td>
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
              <p className="empty-directory">{t.empty}</p>
            )}
          </section>
        </>
      )}

      {view && (
        <section className="panel" aria-labelledby="finance-report">
          <h2 id="finance-report">{x.report}</h2>
          <p className="muted">{x.reportIntro}</p>
          <div className="inline-form">
            <label htmlFor="report-season">
              {x.reportSeason}
              <select
                id="report-season"
                value={reportSeason || view.season.label}
                onChange={(e) => setReportSeason(e.target.value)}
              >
                {view.seasons.map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
              </select>
            </label>
            <Link
              className="button"
              href={`/${locale}/funding/report?season=${reportSeason || view.season.label}`}
            >
              {x.openReport}
            </Link>
            <a
              className="button secondary"
              href={`/api/finance/report?format=csv&season=${reportSeason || view.season.label}`}
            >
              {x.csv}
            </a>
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="finance-dues">
        <h2 id="finance-dues">
          <Icon name="dues" size={18} />
          {t.dues}
        </h2>
        <p>{t.duesText}</p>
        <Link className="button secondary" href={`/${locale}/dues`}>
          {t.openDues}
        </Link>
      </section>
    </main>
  );
}
