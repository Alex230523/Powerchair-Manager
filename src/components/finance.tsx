"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { financeView } from "@/domains/finance/service";
import { categories, methods } from "@/domains/finance/schema";
import { financeCopy } from "./finance-copy";
import { errors } from "./access-copy";
import { Icon } from "./icons";

type View = Awaited<ReturnType<typeof financeView>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

export function Finance({ locale }: { locale: Locale }) {
  const t = financeCopy[locale];
  const [view, setView] = useState<View | null>(null),
    [denied, setDenied] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [adding, setAdding] = useState(false),
    [cancelling, setCancelling] = useState(""),
    [q, setQ] = useState(""),
    [direction, setDirection] = useState(""),
    [category, setCategory] = useState("");
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
    void send({
      action: "record",
      occurredOn: value("date"),
      label: value("label"),
      direction: value("direction"),
      category: value("category"),
      amountCents: Math.round(Number(value("amount").replace(",", ".")) * 100),
      method: value("method"),
      counterparty: value("counterparty"),
      reference: value("reference"),
      notes: value("notes"),
    }).then((ok) => ok && setAdding(false));
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
      <div className="directory-heading">
        <div>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
        </div>
        {view && (
          <div className="directory-actions">
            <button
              className="button secondary"
              type="button"
              onClick={exportCsv}
              disabled={!entries.length}
            >
              {t.export}
            </button>
            <button
              className="button"
              type="button"
              aria-expanded={adding}
              onClick={() => setAdding(!adding)}
            >
              {adding ? t.close : t.add}
            </button>
          </div>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {denied && <p className="notice">{t.restricted}</p>}

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
              </span>
            </li>
          </ul>
          <p className="notice">{t.bankNote}</p>

          {adding && (
            <section className="panel" aria-labelledby="finance-add">
              <h2 id="finance-add">{t.add}</h2>
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
                <label htmlFor="fin-notes">
                  {t.notes}
                  <textarea id="fin-notes" name="notes" maxLength={2000} />
                </label>
                <button className="button" disabled={busy}>
                  {t.save}
                </button>
              </form>
            </section>
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
                      <th scope="col">
                        <span className="sr-only">{t.cancel}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
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
                          {!e.cancelled_at &&
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
            ) : (
              <p className="empty-directory">{t.empty}</p>
            )}
          </section>
        </>
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
