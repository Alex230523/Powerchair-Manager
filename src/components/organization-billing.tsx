"use client";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { organizationBilling } from "@/domains/billing/service";
import { organizationBillingCopy } from "./organization-billing-copy";
import { errors } from "./access-copy";
import { Badge, Button, Card, EmptyState, Field, PageHeader } from "./ui";
import { useData, usePost } from "./use-api";
import { independentCopy } from "./independent-copy";
import { formatCents } from "@/domains/dashboard/summary";
import { externalHref } from "@/lib/html";

type View = Awaited<ReturnType<typeof organizationBilling>>;
const today = () => new Date().toISOString().slice(0, 10);
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (v[k] === undefined ? m : String(v[k])));

/** Console, step 4 (05/11/2026): the organisation reads its subscription and its invoices. */
export function OrganizationBilling({ locale }: { locale: Locale }) {
  const t = organizationBillingCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, denied, setError, reload } = useData<View>("/api/club/billing", failure);
  const { busy, message, post } = usePost("/api/club/billing", reload, setError, failure);
  const x = independentCopy[locale].club;
  const [code, setCode] = useState("");
  const day = (iso: string) => new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso.slice(0, 10) + "T12:00:00Z"));
  const money = (c: number) => formatCents(c, locale);
  if (denied) return <main id="main" className="access"><EmptyState title={errors.FORBIDDEN?.[locale] ?? t.title} /></main>;
  const tone = { draft: "neutral", sent: "warning", paid: "success", cancelled: "neutral" } as const;
  return (
    <main id="main" className="access organization-billing">
      <PageHeader title={t.title} subtitle={t.intro} />
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <Card title={t.plan}>
            {data.subscription ? (
              <p>
                <strong>{data.subscription.plan}</strong> · {money(data.subscription.amount_cents)} {t.periods[data.subscription.period]} {t.bases[data.subscription.basis]} · {fill(t.since, { day: day(data.subscription.started_on) })}
                {data.subscription.ended_on ? ` · ${fill(t.until, { day: day(data.subscription.ended_on) })}` : ""}
              </p>
            ) : (
              <p className="muted">{t.noPlan}</p>
            )}
            {data.subscription?.trial_ends_on && !data.subscription.ended_on && (
              <p className="notice">{fill(data.subscription.trial_ends_on > today() ? x.trial : x.trialOver, { day: day(data.subscription.trial_ends_on) })}</p>
            )}
            {data.subscription?.auto_invoice && !data.subscription.ended_on && <p className="muted small">{x.autoInvoice}</p>}
            {data.subscription?.discount_code && (
              <p>
                {fill(x.codeApplied, {
                  code: data.subscription.discount_code,
                  what: `${data.subscription.discount_percent !== null ? fill(x.percentOff, { n: data.subscription.discount_percent }) : fill(x.amountOff, { amount: money(data.subscription.discount_amount ?? 0) })} ${data.subscription.discount_cycles_left === null ? x.allInvoices : data.subscription.discount_cycles_left === 1 ? x.firstInvoice : fill(x.nInvoices, { n: data.subscription.discount_cycles_left })}`,
                })}
              </p>
            )}
            {data.open > 0 && <p className="finance-treasury"><span className="stat-value">{fill(t.open, { amount: money(data.open) })}</span></p>}
            <p className="muted small">{t.howToPay}</p>
          </Card>
          {data.canAddCode && (
            <Card title={x.codeTitle}>
              <p className="muted">{x.codeIntro}</p>
              <p role="status" className="sr-only">
                {message}
              </p>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void post({ action: "code", code: code.trim().toUpperCase() }, x.codeDone).then((ok) => ok && setCode(""));
                }}
              >
                <Field id="club-discount-code" label={x.codeLabel} help={x.codeHelp} required>
                  <input id="club-discount-code" value={code} onChange={(e) => setCode(e.target.value)} required pattern="[A-Za-z0-9\-]{4,30}" maxLength={30} autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-describedby="club-discount-code-help" />
                </Field>
                <Button loading={busy}>{x.codeSend}</Button>
              </form>
            </Card>
          )}
          <Card title={t.invoices}>
            {data.invoices.length ? (
              <div className="table-scroll" tabIndex={0}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">{t.columns.number}</th>
                      <th scope="col">{t.columns.label}</th>
                      <th scope="col" className="num">{t.columns.amount}</th>
                      <th scope="col">{t.columns.issued}</th>
                      <th scope="col">{t.columns.due}</th>
                      <th scope="col">{t.columns.state}</th>
                      <th scope="col"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((i) => (
                      <tr key={i.id}>
                        <th scope="row">{i.number}</th>
                        <td>{i.label}</td>
                        <td className="num">{money(i.amount_cents)}</td>
                        <td>{day(i.issued_on)}</td>
                        <td>{day(i.due_on)}</td>
                        <td>
                          <Badge tone={i.late ? "danger" : tone[i.state]}>{i.late ? t.late : t.states[i.state]}</Badge>
                          {i.reminders > 0 && <span className="muted small"> {fill(t.reminders, { n: i.reminders })}</span>}
                          {i.state === "paid" && i.paid_via && <span className="muted small"> · {t.paidVia[i.paid_via]}</span>}
                        </td>
                        <td>
                          <span className="console-row-actions">
                            {i.state === "sent" && i.pay_url && (
                              <a className="button sm" href={externalHref(i.pay_url)} rel="noopener">
                                {t.payOnline}
                                <span className="sr-only"> : {i.number}</span>
                              </a>
                            )}
                            <a className="button secondary sm" href={`/api/club/billing?ubl=${i.id}`}>
                              {t.ubl}
                              <span className="sr-only"> : {i.number}</span>
                            </a>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">{t.none}</p>
            )}
          </Card>
        </>
      )}
    </main>
  );
}
