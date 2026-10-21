"use client";
import Link from "next/link";
import { useCallback } from "react";
import type { Locale } from "@/lib/locale";
import type { fundingView } from "@/domains/funding/service";
import type { clubView } from "@/domains/club/service";
import { formatIban } from "@/lib/iban";
import { errors } from "./access-copy";
import { useData } from "./use-api";
import { sponsorsCopy } from "./sponsors-copy";
import { fundingCopy } from "./funding-copy";
import { EmptyState, PageHeader } from "./ui";
import { dayLabel, euro } from "./sponsors";

type View = Awaited<ReturnType<typeof fundingView>>;
type Club = Awaited<ReturnType<typeof clubView>>;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? v[k] : m));

/**
 * Sponsorship agreement (wave 15, C1): club identity, partner, package,
 * conditions, amount and bank transfer, two signature boxes. Printed or saved
 * as PDF from the browser; it is not an invoice.
 */
export function Agreement({ locale, id }: { locale: Locale; id: string }) {
  const s = sponsorsCopy[locale],
    t = fundingCopy[locale] as (typeof fundingCopy)["fr"];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? t.unavailable, [locale, t.unavailable]);
  const { data, error } = useData<View>("/api/funding", failure);
  const { data: club } = useData<Club>("/api/club", failure);
  if (!data || !club)
    return (
      <main id="main" className="access agreement">
        <PageHeader title={s.agreementTitle} />
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const partner = data.partners.find((x) => x.id === id);
  if (!partner)
    return (
      <main id="main" className="access agreement">
        <PageHeader title={s.agreementTitle} />
        <EmptyState icon="document" title={t.unavailable} action={<Link href={`/${locale}/funding/partners`}>{s.back}</Link>} />
      </main>
    );
  const o = club.organization;
  const pkg = data.packages.find((k) => k.id === partner.package_id);
  const conditions = pkg?.conditions.length
    ? pkg.conditions.map((c) => (c.quantity ? `${c.title} · ${c.quantity}` : c.title))
    : data.tasks.filter((x) => x.partner_id === partner.id).map((x) => x.title);
  const season = pkg?.season_name ?? data.seasons[0]?.name ?? s.toDefine;
  const today = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { dateStyle: "long", timeZone: "Europe/Brussels" }).format(new Date(data.today + "T12:00:00Z"));
  return (
    <main id="main" className="access agreement">
      <div className="no-print row-actions">
        <Link className="button secondary" href={`/${locale}/funding/partners?partner=${partner.id}`}>{s.back}</Link>
        <button type="button" className="button" onClick={() => window.print()}>{s.print}</button>
      </div>
      {!o.iban && <p className="notice no-print">{s.agreementNoIban}</p>}
      <article className="agreement-doc" aria-labelledby="agreement-title">
        <header className="agreement-head">
          {o.logo_version && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/club/logo?org=${o.id}&v=${o.logo_version}`} alt="" className="agreement-logo" />
          )}
          <div>
            <p className="eyebrow">{o.name}</p>
            <h1 id="agreement-title">{s.agreementTitle}</h1>
            <p className="muted">{partner.name} · {season}</p>
          </div>
        </header>
        <p>{s.agreementBetween}</p>
        <p>
          {fill(s.agreementClub, {
            club: o.name,
            address: o.address || s.toDefine,
            company: o.company_number || s.toDefine,
            signatory: o.signatory || s.toDefine,
          })}
        </p>
        <p>{s.agreementAnd}</p>
        <p>{fill(s.agreementPartner, { partner: partner.name, contact: partner.contact_name || s.toDefine })}</p>
        <h2>{s.agreementObject}</h2>
        <p>{fill(s.agreementObjectText, { season, package: partner.package_name ?? s.toDefine })}</p>
        <h2>{s.agreementConditions}</h2>
        {conditions.length ? (
          <ol>
            {conditions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        ) : (
          <p>{s.toDefine}</p>
        )}
        <h2>{s.agreementAmount}</h2>
        <p>
          {fill(s.agreementAmountText, {
            amount: euro(locale, partner.amount_cents),
            iban: o.iban ? formatIban(o.iban) : s.toDefine,
            reference: `${partner.name} ${season}`.slice(0, 120),
            due: dayLabel(locale, partner.payment_due_on) || s.toDefine,
          })}
        </p>
        <p className="muted small">{s.agreementNoInvoice}</p>
        <p>{fill(s.agreementSignatures, { date: today })}</p>
        <div className="signature-boxes">
          <div>
            <p><strong>{s.forClub}</strong></p>
            <p>{o.signatory || o.name}</p>
          </div>
          <div>
            <p><strong>{s.forPartner}</strong></p>
            <p>{partner.contact_name || partner.name}</p>
          </div>
        </div>
      </article>
    </main>
  );
}
