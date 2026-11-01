"use client";
import { useCallback } from "react";
import type { Locale } from "@/lib/locale";
import type { playerProfileView } from "@/domains/player-profile/service";
import { applyPayments } from "@/domains/reminders/schema";
import { bankCopy } from "./bank-copy";
import { errors } from "./access-copy";
import { fill } from "./fleet-copy";
import { Button, PageHeader } from "./ui";
import { TransferQr } from "./transfer-qr";
import { useData } from "./use-api";

type View = Awaited<ReturnType<typeof playerProfileView>>;
type Due = { id: string; category: string; net_cents: number; reference: string; paid_cents: number; installments: { due_on: string; amount_cents: number; reference: string }[] };

/** B1: what is left on one fee, a transfer QR per unpaid instalment, ready to print. */
export function PaymentSheet({ locale, id, receivable }: { locale: Locale; id: string; receivable: string }) {
  const t = bankCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? t.noDuesAccount, [locale, t]);
  const { data, error } = useData<View>("/api/player-profile?id=" + encodeURIComponent(id), failure);
  const tag = locale === "en" ? "en-GB" : `${locale}-BE`;
  const day = (d: string) => new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  const due = (data?.dues as Due[] | undefined)?.find((d) => d.id === receivable);
  const title = fill(t.printTitle, { name: data?.player.full_name ?? "" });
  if (!data) return <main id="main" className="access">{error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}</main>;
  // What is left, instalment by instalment (the oldest paid first); a fee without instalments is paid at once.
  const open = due
    ? due.installments.length
      ? applyPayments(due.installments, due.paid_cents).map((i) => ({ ...i, reference: (i as { reference?: string }).reference ?? due.reference }))
      : due.net_cents > due.paid_cents
        ? [{ due_on: "", amount_cents: due.net_cents - due.paid_cents, reference: due.reference }]
        : []
    : [];
  return (
    <main id="main" className="access payment-sheet">
      <PageHeader title={title} subtitle={data.context.name} actions={<Button type="button" icon="document" onClick={() => window.print()}>{t.print}</Button>} />
      {!due || !open.length ? (
        <p className="notice">{t.allClear}</p>
      ) : !data.payment ? (
        <p className="notice">{t.noDuesAccount}</p>
      ) : (
        <>
          <p>{t.payIntro}</p>
          {open.map((i) => (
            <section key={i.reference} aria-label={i.due_on ? day(i.due_on) : t.pay}>
              {i.due_on && <h2>{day(i.due_on)}</h2>}
              <TransferQr locale={locale} payment={data.payment!} cents={i.amount_cents} reference={i.reference} />
            </section>
          ))}
        </>
      )}
    </main>
  );
}
