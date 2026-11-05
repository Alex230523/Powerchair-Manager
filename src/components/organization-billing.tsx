"use client";
import { useCallback } from "react";
import type { Locale } from "@/lib/locale";
import type { organizationBilling } from "@/domains/billing/service";
import { organizationBillingCopy } from "./organization-billing-copy";
import { errors } from "./access-copy";
import { Badge, Card, EmptyState, PageHeader } from "./ui";
import { useData } from "./use-api";
import { formatCents } from "@/domains/dashboard/summary";

type View = Awaited<ReturnType<typeof organizationBilling>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (v[k] === undefined ? m : String(v[k])));

/** Console, step 4 (05/11/2026): the organisation reads its subscription and its invoices. */
export function OrganizationBilling({ locale }: { locale: Locale }) {
  const t = organizationBillingCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, denied } = useData<View>("/api/club/billing", failure);
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
            {data.open > 0 && <p className="finance-treasury"><span className="stat-value">{fill(t.open, { amount: money(data.open) })}</span></p>}
            <p className="muted small">{t.howToPay}</p>
          </Card>
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
