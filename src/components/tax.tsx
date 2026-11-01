"use client";
import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import { taxCopy, type TaxCopy } from "./tax-copy";
import { errors } from "./access-copy";
import { fill } from "./fleet-copy";
import { Badge, Button, Card, EmptyState, PageHeader } from "./ui";
import { Modal } from "./modal";
import { FinanceNav } from "./finance-nav";

/**
 * B8: Finances › Attestations fiscales, for an approved club only. The
 * year's gifts (only those without anything in return count), the donors
 * (the national number sealed, shown with the dedicated right), the
 * control report, the receipts (issue, PDF, correction, cancellation,
 * e-mail) and the Belcotax-on-Web file, checked before it leaves.
 */
type Donor = {
  id: string;
  kind: "person" | "company";
  name: string;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  email: string;
  company_number: string;
  contact_id: string | null;
  has_national: boolean;
  purged: boolean;
  pending_request: string | null;
  total_cents: number;
};
type Gift = { id: string; donor_id: string; received_on: string; amount_cents: number; nature: string; note: string; cancelled_at: string | null; cancel_reason: string | null };
type Receipt = { id: string; donor_id: string; name: string; year: number; sequence: number; amount_cents: number; status: "issued" | "corrected" | "cancelled"; correction: boolean; reason: string; emailed_at: string | null };
type Candidate = { source: "ledger" | "pot"; id: string; received_on: string; amount_cents: number; name: string; label: string };
type Issue = { code: keyof TaxCopy["issues"]; sequence?: number };
type View = {
  organization_id: string;
  today: string;
  year: number;
  can: { manage: boolean; identity: boolean; approve: boolean };
  club: { name: string; approvalNumber: string; approvalFrom: string; approvalTo: string; thresholdCents: number };
  alert: "ended" | "ending" | null;
  deadline: string;
  donors: Donor[];
  gifts: Gift[];
  receipts: Receipt[];
  report: { eligible: string[]; below: string[]; missing: string[]; duplicates: string[][] };
  candidates: Candidate[];
  contacts: { id: string; name: string; email: string }[];
  mandates: { id: string; name: string; role: string; granted: boolean }[];
};
type Ctx = {
  t: TaxCopy;
  data: View;
  busy: boolean;
  error: string;
  send: <T = Record<string, unknown>>(body: Record<string, unknown>, done: string | ((out: T) => string)) => Promise<T | null>;
  money: (cents: number) => string;
  day: (d: string) => string;
  donorName: (id: string) => string;
};
const toCents = (v: string) => Math.round(Number(String(v).replace(/\s/g, "").replace(",", ".")) * 100);

export function TaxReceipts({ locale }: { locale: Locale }) {
  const t = taxCopy[locale];
  const [year, setYear] = useState<number | null>(null),
    [data, setData] = useState<View | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [donor, setDonor] = useState<Donor | "new" | null>(null),
    [national, setNational] = useState<Donor | null>(null),
    [gift, setGift] = useState<{ candidate?: Candidate } | null>(null),
    [closing, setClosing] = useState<{ kind: "gift" | "correct" | "cancelReceipt"; id: string; title: string } | null>(null),
    [revealed, setRevealed] = useState<Record<string, string>>({}),
    [issues, setIssues] = useState<Issue[] | null>(null);
  const failure = useCallback((code: string) => t.errors[code] ?? errors[code]?.[locale] ?? code, [t, locale]);
  const url = "/api/tax" + (year ? `?year=${year}` : "");
  const load = useCallback(async () => {
    const r = await fetch(url, { cache: "no-store" });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setData(v);
  }, [url]);
  // Each year's first load; `load` refreshes after a command.
  useEffect(() => {
    let cancelled = false;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!cancelled) setData(v);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(failure(e.message));
      });
    return () => {
      cancelled = true;
    };
  }, [url, failure]);
  const tag = locale === "en" ? "en-GB" : `${locale}-BE`;
  const money = (cents: number) => new Intl.NumberFormat(tag, { style: "currency", currency: "EUR" }).format(cents / 100);
  const day = (d: string) => (d ? new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z")) : "");
  async function send<T = Record<string, unknown>>(body: Record<string, unknown>, done: string | ((out: T) => string)): Promise<T | null> {
    if (!data) return null;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/tax", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: data.organization_id }) });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error);
      if (body.action !== "revealNational") await load();
      setMessage(typeof done === "string" ? done : done(out as T));
      return out as T;
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
      return null;
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <main id="main" className="access finance tax">
        <PageHeader title={t.title} />
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const donorName = (id: string) => data.donors.find((d) => d.id === id)?.name ?? "";
  const ctx: Ctx = { t, data, busy, error, send, money, day, donorName };
  const dialog = !!(donor || national || gift || closing);
  const thisYear = Number(data.today.slice(0, 4));
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);
  const withGifts = data.donors.filter((d) => d.total_cents > 0);
  return (
    <main id="main" className="access finance tax">
      <PageHeader title={t.title} subtitle={t.intro} />
      <FinanceNav locale={locale} current="tax" />
      {error && !dialog && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {data.alert && <p className="notice">{fill(data.alert === "ended" ? t.alertEnded : t.alertEnding, { date: day(data.club.approvalTo) })}</p>}
      <div className="tax-year">
        <label htmlFor="tax-year">
          {t.year}
          <select id="tax-year" value={data.year} onChange={(e) => (setYear(Number(e.target.value)), setIssues(null))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <p>
          <strong>{fill(t.deadline, { date: day(data.deadline) })}</strong>
          <br />
          <span className="muted small">{t.deadlineHint}</span>
        </p>
      </div>

      <Card title={t.report} subtitle={t.reportIntro} id="tax-report">
        <dl className="tax-report">
          <dt>{t.eligible}</dt>
          <dd>{data.report.eligible.length ? data.report.eligible.map(donorName).join(", ") : t.none}</dd>
          <dt>{t.below}</dt>
          <dd>{data.report.below.length ? data.report.below.map(donorName).join(", ") : t.none}</dd>
          <dt>{t.missing}</dt>
          <dd>{data.report.missing.length ? data.report.missing.map(donorName).join(", ") : t.none}</dd>
          <dt>{t.duplicates}</dt>
          <dd>{data.report.duplicates.length ? data.report.duplicates.map((g) => g.map(donorName).join(" = ")).join(" ; ") : t.none}</dd>
        </dl>
        <p className="muted small">{t.nationalTolerance}</p>
      </Card>

      <Card
        title={t.receipts}
        subtitle={t.receiptsIntro}
        id="tax-receipts"
        actions={
          data.can.manage && (
            <span className="actions">
              <Button disabled={busy || !data.report.eligible.length} onClick={() => void send<{ issued: number }>({ action: "issue", year: data.year }, (o) => fill(t.issued, { n: o.issued }))}>
                {t.issue}
              </Button>
              <Button variant="secondary" disabled={busy || !data.receipts.some((r) => r.status === "issued" && !r.emailed_at)} onClick={() => void send<{ sent: number }>({ action: "send", year: data.year }, (o) => fill(t.sent, { n: o.sent }))}>
                {t.send}
              </Button>
            </span>
          )
        }
      >
        {data.receipts.length ? (
          <div className="table-scroll" role="region" aria-label={t.receipts} tabIndex={0}>
            <table className="ledger tax-receipts">
              <thead>
                <tr>
                  <th scope="col">{t.number}</th>
                  <th scope="col">{t.donor}</th>
                  <th scope="col" className="num">
                    {t.amount}
                  </th>
                  <th scope="col">{t.status}</th>
                  <th scope="col">
                    <span className="sr-only">{t.pdf}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.receipts.map((r) => (
                  <tr key={r.id} data-cancelled={r.status !== "issued" || undefined}>
                    <th scope="row">
                      {r.year}/{r.sequence}
                    </th>
                    <td>{r.name}</td>
                    <td className="num">{money(r.amount_cents)}</td>
                    <td>
                      <Badge tone={r.status === "issued" ? "success" : "neutral"}>{t.statuses[r.status]}</Badge> {r.correction && <span className="muted small">{t.correction}</span>} {r.emailed_at && <span className="muted small">{t.emailed}</span>}
                      {r.reason && <span className="muted small"> · {r.reason}</span>}
                    </td>
                    <td className="ledger-actions">
                      <a className="button secondary sm" href={`/api/tax/receipts/${r.id}`} target="_blank" rel="noopener" aria-label={fill(t.pdfOf, { n: `${r.year}/${r.sequence}`, name: r.name })}>
                        {t.pdf}
                      </a>
                      {data.can.manage && r.status === "issued" && (
                        <>
                          <Button size="sm" variant="secondary" disabled={busy} aria-label={fill(t.correctOf, { n: `${r.year}/${r.sequence}`, name: r.name })} onClick={() => setClosing({ kind: "correct", id: r.id, title: fill(t.correctOf, { n: `${r.year}/${r.sequence}`, name: r.name }) })}>
                            {t.correct}
                          </Button>
                          <Button size="sm" variant="secondary" disabled={busy} aria-label={fill(t.cancelReceiptOf, { n: `${r.year}/${r.sequence}`, name: r.name })} onClick={() => setClosing({ kind: "cancelReceipt", id: r.id, title: fill(t.cancelReceiptOf, { n: `${r.year}/${r.sequence}`, name: r.name }) })}>
                            {t.cancelReceipt}
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={t.noReceipt} />
        )}
      </Card>

      <Card title={t.gifts} subtitle={t.giftsIntro} id="tax-gifts" actions={data.can.manage && data.donors.length > 0 && <Button icon="plus" variant="secondary" onClick={() => setGift({})}>{t.addGift}</Button>}>
        {data.candidates.length > 0 && (
          <section aria-labelledby="tax-candidates">
            <h3 id="tax-candidates">{t.candidates}</h3>
            <p className="muted small">{t.candidatesIntro}</p>
            <ul className="tax-list">
              {data.candidates.map((c) => (
                <li key={c.source + c.id}>
                  <span>
                    {day(c.received_on)} · <strong>{c.name}</strong> · {money(c.amount_cents)} <Badge>{t.sources[c.source]}</Badge>
                  </span>
                  {data.can.manage && data.donors.length > 0 && (
                    <Button size="sm" variant="secondary" disabled={busy} aria-label={fill(t.qualifyOf, { name: c.name, date: day(c.received_on) })} onClick={() => setGift({ candidate: c })}>
                      {t.qualify}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {data.gifts.length ? (
          <ul className="tax-list">
            {data.gifts.map((g) => (
              <li key={g.id} data-cancelled={g.cancelled_at ? true : undefined}>
                <span>
                  {day(g.received_on)} · <strong>{donorName(g.donor_id)}</strong> · {money(g.amount_cents)} <Badge tone={g.nature === "gift" ? "success" : "neutral"}>{t.natures[g.nature as keyof TaxCopy["natures"]]}</Badge>
                  {g.cancelled_at && <span className="muted small"> · {t.cancelled} {g.cancel_reason}</span>}
                </span>
                {data.can.manage && !g.cancelled_at && (
                  <Button size="sm" variant="secondary" disabled={busy} aria-label={fill(t.cancelGiftOf, { name: donorName(g.donor_id), date: day(g.received_on) })} onClick={() => setClosing({ kind: "gift", id: g.id, title: fill(t.cancelGiftOf, { name: donorName(g.donor_id), date: day(g.received_on) }) })}>
                    {t.cancelGift}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.noGift}</p>
        )}
      </Card>

      <Card title={t.donors} subtitle={t.donorsIntro} id="tax-donors" actions={data.can.manage && <Button icon="plus" variant="secondary" onClick={() => setDonor("new")}>{t.addDonor}</Button>}>
        {data.donors.length ? (
          <ul className="tax-list">
            {data.donors.map((d) => (
              <li key={d.id}>
                <span>
                  <strong>{d.name}</strong> · {t.kinds[d.kind]}
                  {d.total_cents > 0 && <> · {fill(`${t.total} : {n}`, { n: money(d.total_cents) })}</>}
                  {d.kind === "person" && (
                    <>
                      {" "}
                      <Badge tone={d.has_national ? "success" : "warning"}>
                        {t.national} : {revealed[d.id] ?? (d.has_national ? t.nationalSet : d.pending_request ? t.requestPending : t.nationalMissing)}
                      </Badge>
                    </>
                  )}
                  {d.purged && <span className="muted small"> · {t.purged}</span>}
                </span>
                {data.can.manage && (
                  <span className="actions">
                    <Button size="sm" variant="secondary" aria-label={fill(t.editDonorOf, { name: d.name })} onClick={() => setDonor(d)}>
                      {t.edit}
                    </Button>
                    {d.kind === "person" && data.can.identity && d.has_national && !revealed[d.id] && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        aria-label={fill(t.revealOf, { name: d.name })}
                        onClick={() => void send<{ value: string }>({ action: "revealNational", donorId: d.id }, "").then((o) => o && setRevealed((r) => ({ ...r, [d.id]: o.value })))}
                      >
                        {t.reveal}
                      </Button>
                    )}
                    {d.kind === "person" && data.can.identity && (
                      <Button size="sm" variant="secondary" aria-label={fill(t.nationalOf, { name: d.name })} onClick={() => setNational(d)}>
                        {t.national}
                      </Button>
                    )}
                    {d.kind === "person" && !d.has_national && d.email && (
                      <Button size="sm" variant="secondary" disabled={busy} aria-label={fill(t.requestOf, { name: d.name })} onClick={() => void send({ action: "requestNational", donorId: d.id }, t.requested)}>
                        {t.request}
                      </Button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t.noDonor} />
        )}
        {withGifts.length === 0 && data.donors.length > 0 && <p className="muted small">{t.noGift}</p>}
      </Card>

      <Card title={t.belcotax} subtitle={t.belcotaxIntro} id="tax-belcotax">
        {data.can.identity ? (
          <>
            <p className="actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void fetch(`/api/tax/export?year=${data.year}&check=1`, { cache: "no-store" })
                    .then(async (r) => {
                      const v = await r.json();
                      if (!r.ok) throw new Error(v.error);
                      setIssues(v.issues);
                    })
                    .catch((e: Error) => setError(failure(e.message)))
                }
              >
                {t.check}
              </Button>
              <a className="button secondary" href={`/api/tax/export?year=${data.year}`} download>
                {t.export}
              </a>
            </p>
            {issues && (
              <div role="status">
                {issues.length ? (
                  <ul>
                    {issues.map((i, n) => (
                      <li key={n}>{fill(t.issues[i.code], { n: i.sequence ?? "" })}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{t.checkOk}</p>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="muted">{t.rightsIntro}</p>
        )}
      </Card>

      {data.can.approve && (
        <Card title={t.rights} subtitle={t.rightsIntro} id="tax-rights">
          {data.mandates.length ? (
            <ul className="tax-list">
              {data.mandates.map((m) => (
                <li key={m.id}>
                  <label className="check">
                    <input type="checkbox" checked={m.granted} disabled={busy} onChange={(e) => void send({ action: "identityRight", mandateId: m.id, granted: e.target.checked }, t.saved)} />
                    {fill(t.rightOf, { name: m.name })}
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t.noOne}</p>
          )}
        </Card>
      )}

      {donor && <DonorForm ctx={ctx} donor={donor === "new" ? null : donor} close={() => setDonor(null)} />}
      {national && <NationalForm ctx={ctx} donor={national} close={() => setNational(null)} />}
      {gift && <GiftForm ctx={ctx} candidate={gift.candidate} close={() => setGift(null)} />}
      {closing && <ReasonForm ctx={ctx} {...closing} close={() => setClosing(null)} />}
    </main>
  );
}

function DonorForm({ ctx, donor, close }: { ctx: Ctx; donor: Donor | null; close: () => void }) {
  const { t, data, busy, send } = ctx;
  const [kind, setKind] = useState<"person" | "company">(donor?.kind ?? "person");
  return (
    <Modal title={donor ? fill(t.editDonorOf, { name: donor.name }) : t.addDonor} close={close}>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const v = (k: string) => String(f.get(k) ?? "").trim();
          void send(
            {
              action: "donor",
              ...(donor ? { id: donor.id } : {}),
              kind,
              name: v("name"),
              street: v("street"),
              postalCode: v("postalCode"),
              city: v("city"),
              country: v("country").toUpperCase() || "BE",
              email: v("email"),
              companyNumber: kind === "company" ? v("companyNumber") : "",
              contactId: v("contact") || null,
            },
            t.saved,
          ).then((ok) => ok && close());
        }}
      >
        <fieldset>
          <legend>{t.kind}</legend>
          {(["person", "company"] as const).map((k) => (
            <label key={k} className="check">
              <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
              {t.kinds[k]}
            </label>
          ))}
        </fieldset>
        <label htmlFor="tax-donor-name">
          {t.name}
          <input id="tax-donor-name" name="name" required minLength={2} maxLength={160} defaultValue={donor?.name ?? ""} />
        </label>
        <label htmlFor="tax-donor-street">
          {t.street}
          <input id="tax-donor-street" name="street" maxLength={160} autoComplete="street-address" defaultValue={donor?.street ?? ""} />
        </label>
        <div className="form-grid">
          <label htmlFor="tax-donor-postal">
            {t.postalCode}
            <input id="tax-donor-postal" name="postalCode" maxLength={12} autoComplete="postal-code" defaultValue={donor?.postal_code ?? ""} />
          </label>
          <label htmlFor="tax-donor-city">
            {t.city}
            <input id="tax-donor-city" name="city" maxLength={80} autoComplete="address-level2" defaultValue={donor?.city ?? ""} />
          </label>
          <label htmlFor="tax-donor-country">
            {t.country}
            <input id="tax-donor-country" name="country" maxLength={2} pattern="[A-Za-z]{2}" defaultValue={donor?.country ?? "BE"} />
          </label>
        </div>
        <label htmlFor="tax-donor-email">
          {t.email}
          <input id="tax-donor-email" name="email" type="email" maxLength={254} autoComplete="email" defaultValue={donor?.email ?? ""} />
        </label>
        {kind === "company" && (
          <label htmlFor="tax-donor-company">
            {t.companyNumber}
            <input id="tax-donor-company" name="companyNumber" required inputMode="numeric" maxLength={14} defaultValue={donor?.company_number ?? ""} />
          </label>
        )}
        {data.contacts.length > 0 && (
          <label htmlFor="tax-donor-contact">
            {t.contact}
            <select id="tax-donor-contact" name="contact" defaultValue={donor?.contact_id ?? ""}>
              <option value="">{t.noContact}</option>
              {data.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {ctx.error && <p role="alert">{ctx.error}</p>}
        <div className="actions">
          <Button disabled={busy}>{t.save}</Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function NationalForm({ ctx, donor, close }: { ctx: Ctx; donor: Donor; close: () => void }) {
  const { t, busy, send } = ctx;
  return (
    <Modal title={fill(t.nationalOf, { name: donor.name })} close={close}>
      <form
        className="stack-form"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          const value = String(new FormData(e.currentTarget).get("national") ?? "");
          void send({ action: "national", donorId: donor.id, value }, t.saved).then((ok) => ok && close());
        }}
      >
        <label htmlFor="tax-national">
          {t.national}
          <input id="tax-national" name="national" required inputMode="numeric" maxLength={15} autoComplete="off" spellCheck={false} aria-describedby="tax-national-hint" />
          <span id="tax-national-hint" className="muted">
            {t.nationalHint}
          </span>
        </label>
        {ctx.error && <p role="alert">{ctx.error}</p>}
        <div className="actions">
          <Button disabled={busy}>{t.save}</Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function GiftForm({ ctx, candidate, close }: { ctx: Ctx; candidate?: Candidate; close: () => void }) {
  const { t, data, busy, send, money, day } = ctx;
  const title = candidate ? fill(t.qualifyOf, { name: candidate.name, date: day(candidate.received_on) }) : t.addGift;
  return (
    <Modal title={title} close={close}>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void send(
            {
              action: "gift",
              donorId: String(f.get("donor") ?? ""),
              receivedOn: candidate?.received_on ?? String(f.get("date") ?? ""),
              amountCents: candidate?.amount_cents ?? toCents(String(f.get("amount") ?? "")),
              nature: String(f.get("nature") ?? "gift"),
              note: String(f.get("note") ?? ""),
              transactionId: candidate?.source === "ledger" ? candidate.id : null,
              movementId: candidate?.source === "pot" ? candidate.id : null,
            },
            t.saved,
          ).then((ok) => ok && close());
        }}
      >
        {candidate && (
          <p>
            {day(candidate.received_on)} · {money(candidate.amount_cents)} · {candidate.label}
          </p>
        )}
        <label htmlFor="tax-gift-donor">
          {t.donor}
          <select id="tax-gift-donor" name="donor" required defaultValue="">
            <option value="" disabled>
              {t.chooseDonor}
            </option>
            {data.donors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {!candidate && (
          <div className="form-grid">
            <label htmlFor="tax-gift-date">
              {t.date}
              <input id="tax-gift-date" name="date" type="date" required min={`${data.year}-01-01`} max={`${data.year}-12-31` < data.today ? `${data.year}-12-31` : data.today} defaultValue={`${data.year}-12-31` < data.today ? `${data.year}-12-31` : data.today} />
            </label>
            <label htmlFor="tax-gift-amount">
              {t.amount}
              <input id="tax-gift-amount" name="amount" required inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" />
            </label>
          </div>
        )}
        <label htmlFor="tax-gift-nature">
          {t.nature}
          <select id="tax-gift-nature" name="nature" defaultValue="gift" aria-describedby="tax-gift-nature-hint">
            {(["gift", "in_kind", "purchase", "sponsor", "dues"] as const).map((k) => (
              <option key={k} value={k}>
                {t.natures[k]}
              </option>
            ))}
          </select>
          <span id="tax-gift-nature-hint" className="muted">
            {t.natureHint}
          </span>
        </label>
        <label htmlFor="tax-gift-note">
          {t.note}
          <input id="tax-gift-note" name="note" maxLength={300} />
        </label>
        {ctx.error && <p role="alert">{ctx.error}</p>}
        <div className="actions">
          <Button disabled={busy}>{t.save}</Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReasonForm({ ctx, kind, id, title, close }: { ctx: Ctx; kind: "gift" | "correct" | "cancelReceipt"; id: string; title: string; close: () => void }) {
  const { t, busy, send } = ctx;
  return (
    <Modal title={title} close={close}>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
          void send({ action: kind === "gift" ? "cancelGift" : kind, id, reason }, t.saved).then((ok) => ok && close());
        }}
      >
        <label htmlFor="tax-reason">
          {t.reason}
          <input id="tax-reason" name="reason" required minLength={5} maxLength={300} aria-describedby="tax-reason-hint" />
          <span id="tax-reason-hint" className="muted">
            {t.reasonHint}
          </span>
        </label>
        {ctx.error && <p role="alert">{ctx.error}</p>}
        <div className="actions">
          <Button disabled={busy}>{kind === "correct" ? t.correct : t.cancelReceipt}</Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
