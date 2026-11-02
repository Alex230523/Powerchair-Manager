"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { bookingsView } from "@/domains/venues/bookings";
import { billings, bookingStatuses } from "@/domains/venues/bookings-schema";
import { venueBookingsCopy } from "./venue-bookings-copy";
import { errors } from "./access-copy";
import { Badge, Button, Card, EmptyState } from "./ui";

/**
 * 18: the Places page's bookings. For each hall and season: status and
 * reference, the slots, the planned cost (and per team), the email ready
 * for the hall, the confirmation, the invoices with their gap to the plan
 * and « Enregistrer la dépense », once.
 */
type View = Awaited<ReturnType<typeof bookingsView>>;
type Booking = View["bookings"][number];
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const euros = (l: Locale, c: number) => new Intl.NumberFormat(l === "en" ? "en-GB" : `${l}-BE`, { style: "currency", currency: "EUR" }).format(c / 100);
const dayText = (l: Locale, d: string) => new Intl.DateTimeFormat(l === "en" ? "en-GB" : `${l}-BE`, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
const tones: Record<string, string> = { to_request: "warning", requested: "info", confirmed: "success", refused: "danger", cancelled: "neutral" };

async function post(body: Record<string, unknown>) {
  const r = await fetch("/api/venues/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
  return v as { id?: string };
}
async function upload(org: string, kind: "confirmation" | "invoice", id: string, file: File) {
  const f = new FormData();
  f.set("organizationId", org);
  f.set("file", file);
  const r = await fetch(`/api/venues/bookings/file?kind=${kind}&id=${id}`, { method: "POST", body: f });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(v.error ?? "INVALID_FILE");
}

export function VenueBookings({ locale }: { locale: Locale }) {
  const t = venueBookingsCopy[locale];
  const [data, setData] = useState<View | null>(null),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [failed, setFailed] = useState(""),
    [denied, setDenied] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/venues/bookings?locale=${locale}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as View) : null))
      .then((v) => {
        if (!live) return;
        if (v) setData(v);
        else setDenied(true);
      })
      .catch(() => {
        if (live) setDenied(true);
      });
    return () => {
      live = false;
    };
  }, [locale, version]);
  if (denied) return null;
  const run = async (work: () => Promise<unknown>, done = t.saved) => {
    setBusy(true);
    setFailed("");
    setStatus("");
    try {
      await work();
      setStatus(done);
      setVersion((v) => v + 1);
      return true;
    } catch (e) {
      const code = (e as Error).message;
      setFailed(t.errors[code] ?? errors[code]?.[locale] ?? errors.INVALID_INPUT?.[locale] ?? code);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      title={t.title}
      id="bookings"
      headingId="bookings-title"
      labelledBy="bookings-title"
      actions={
        data?.can.manage && (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void run(() => post({ organizationId: data.organization_id, action: "refresh" }))}>
            {t.refresh}
          </Button>
        )
      }
    >
      <p className="muted">{t.intro}</p>
      <p role="status" className="sr-only">
        {status}
      </p>
      {failed && <p role="alert">{failed}</p>}
      {!data ? (
        <p role="status">{t.loading}</p>
      ) : !data.bookings.length ? (
        <EmptyState title={t.none} />
      ) : (
        <ul className="booking-list">
          {data.bookings.map((b) => (
            <BookingCard key={b.id} locale={locale} b={b} org={data.organization_id} can={data.can} busy={busy} run={run} />
          ))}
        </ul>
      )}
    </Card>
  );
}

type Run = (work: () => Promise<unknown>, done?: string) => Promise<boolean>;
function BookingCard({ locale, b, org, can, busy, run }: { locale: Locale; b: Booking; org: string; can: View["can"]; busy: boolean; run: Run }) {
  const t = venueBookingsCopy[locale];
  const [expense, setExpense] = useState<string | null>(null);
  const base = `booking-${b.id}`;
  const season = b.season ? fill(t.season, { season: b.season }) : t.noSeason;
  const mailto = b.contact_email ? `mailto:${b.contact_email}?subject=${encodeURIComponent(b.email.subject)}&body=${encodeURIComponent(b.email.body)}` : null;
  function saveStatus(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(() => post({ organizationId: org, action: "status", id: b.id, status: f.get("status"), reference: String(f.get("reference") ?? "") }));
  }
  function saveSettings(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(() => post({ organizationId: org, action: "update", id: b.id, billing: f.get("billing"), rateLabel: String(f.get("rate") ?? "") || null, reference: b.reference, notes: String(f.get("notes") ?? "") }));
  }
  function addInvoice(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const file = f.get("file");
    void run(async () => {
      const made = await post({
        organizationId: org,
        action: "invoice",
        bookingId: b.id,
        period: String(f.get("period") ?? ""),
        amountCents: Math.round(Number(String(f.get("amount") ?? "0").replace(",", ".")) * 100),
        issuedOn: String(f.get("issuedOn") ?? ""),
      });
      if (file instanceof File && file.size && made.id) await upload(org, "invoice", made.id, file);
      form.reset();
    });
  }
  return (
    <Card as="li" className="booking-card" title={`${b.place} · ${season}`} headingId={`${base}-title`} labelledBy={`${base}-title`}>
      <p className="trip-meta">
        <Badge tone={tones[b.status]}>{t.statuses[b.status as keyof typeof t.statuses]}</Badge>
        <span>{fill(t.sessions, { n: b.sessions })}</span>
        {b.reference && <span>{b.reference}</span>}
      </p>
      <dl className="booking-money">
        <dt>{t.planned}</dt>
        <dd>{euros(locale, b.planned_cost_cents)}</dd>
        <dt>{t.invoiced}</dt>
        <dd>{euros(locale, b.invoiced_cents)}</dd>
        <dt>{t.paid}</dt>
        <dd>{euros(locale, b.paid_cents)}</dd>
      </dl>
      {b.slots.length > 0 && (
        <>
          <h3>{t.slots}</h3>
          <ul className="plain-list small">
            {b.slots.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      {b.teams.length > 1 && (
        <>
          <h3>{t.perTeam}</h3>
          <ul className="plain-list small">
            {b.teams.map((x, i) => (
              <li key={i}>{fill(t.teamLine, { team: x.team || t.wholeClub, n: x.sessions, amount: euros(locale, x.cents) })}</li>
            ))}
          </ul>
        </>
      )}
      {can.manage && (
        <form className="form-grid booking-form" onSubmit={saveStatus}>
          <label htmlFor={`${base}-status`}>
            {t.status}
            <select id={`${base}-status`} name="status" defaultValue={b.status}>
              {bookingStatuses.map((s) => (
                <option key={s} value={s}>
                  {t.statuses[s]}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={`${base}-reference`}>
            {t.reference}
            <input id={`${base}-reference`} name="reference" maxLength={120} defaultValue={b.reference} />
          </label>
          <div className="actions">
            <Button type="submit" disabled={busy}>
              {t.saveStatus}
            </Button>
          </div>
        </form>
      )}
      <details className="booking-email">
        <summary>{t.email}</summary>
        {b.contact_email && <p className="small">{fill(t.emailTo, { to: `${b.contact ?? ""} <${b.contact_email}>` })}</p>}
        <label htmlFor={`${base}-mail`}>
          <span className="sr-only">{t.email}</span>
          <textarea id={`${base}-mail`} readOnly rows={10} value={`${b.email.subject}\n\n${b.email.body}`} />
        </label>
        <p className="actions">
          {mailto && (
            <a className="button secondary" href={mailto}>
              {t.openMail}
            </a>
          )}
          <Button type="button" variant="secondary" onClick={() => void run(() => navigator.clipboard.writeText(`${b.email.subject}\n\n${b.email.body}`), t.copied)}>
            {t.copy}
          </Button>
        </p>
      </details>
      {can.manage && (
        <details className="booking-settings">
          <summary>{t.settings}</summary>
          <form className="stack-form" onSubmit={saveSettings}>
            <label htmlFor={`${base}-billing`}>
              {t.billing}
              <select id={`${base}-billing`} name="billing" defaultValue={b.billing}>
                {billings.map((x) => (
                  <option key={x} value={x}>
                    {t.billings[x]}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`${base}-rate`}>
              {t.rate}
              <select id={`${base}-rate`} name="rate" defaultValue={b.rate_label ?? ""}>
                <option value="">{t.noRate}</option>
                {b.labels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`${base}-notes`}>
              {t.notes}
              <textarea id={`${base}-notes`} name="notes" rows={2} maxLength={2000} defaultValue={b.notes} />
            </label>
            <div className="actions">
              <Button type="submit" disabled={busy}>
                {t.saveSettings}
              </Button>
            </div>
          </form>
          <h3>{t.confirmation}</h3>
          {b.confirmation_filename && (
            <p>
              <a href={`/api/venues/bookings/file?kind=confirmation&id=${b.id}`} target="_blank" rel="noreferrer">
                {t.confirmationOpen} ({b.confirmation_filename})
              </a>
            </p>
          )}
          <label htmlFor={`${base}-confirmation`}>
            {t.upload}
            <input
              id={`${base}-confirmation`}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void run(() => upload(org, "confirmation", b.id, file));
              }}
            />
          </label>
        </details>
      )}
      <h3>{t.invoices}</h3>
      {b.invoices.length ? (
        <ul className="plain-list booking-invoices">
          {b.invoices.map((i) => (
            <li key={i.id}>
              <span>{fill(t.invoiceLine, { period: i.period, amount: euros(locale, i.amount_cents), date: dayText(locale, i.issued_on) })}</span>{" "}
              {i.gap && <Badge tone={i.gap.tone}>{i.gap.gap === 0 ? t.onPlan : fill(t.gap, { gap: euros(locale, i.gap.gap) })}</Badge>}{" "}
              {i.transaction_id && <Badge tone="success">{t.recorded}</Badge>}
              <span className="row-actions">
                {i.filename && (
                  <a className="text-button" href={`/api/venues/bookings/file?kind=invoice&id=${i.id}`} target="_blank" rel="noreferrer">
                    {t.openFile}
                    <span className="sr-only"> : {i.period}</span>
                  </a>
                )}
                {can.money && !i.transaction_id && (
                  <button type="button" className="text-button" aria-expanded={expense === i.id} onClick={() => setExpense(expense === i.id ? null : i.id)}>
                    {t.expense}
                    <span className="sr-only"> : {i.period}</span>
                  </button>
                )}
                {can.manage && !i.transaction_id && (
                  <button type="button" className="text-button" disabled={busy} onClick={() => void run(() => post({ organizationId: org, action: "removeInvoice", id: i.id }))}>
                    {t.removeInvoice}
                    <span className="sr-only"> : {i.period}</span>
                  </button>
                )}
              </span>
              {expense === i.id && (
                <form
                  className="form-grid"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(() => post({ organizationId: org, action: "expense", invoiceId: i.id, occurredOn: f.get("occurredOn"), label: f.get("label") })).then((ok) => ok && setExpense(null));
                  }}
                >
                  <label htmlFor={`${i.id}-date`}>
                    {t.expenseDate}
                    <input id={`${i.id}-date`} name="occurredOn" type="date" required defaultValue={i.issued_on} />
                  </label>
                  <label htmlFor={`${i.id}-label`}>
                    {t.expenseLabel}
                    <input id={`${i.id}-label`} name="label" required minLength={2} maxLength={200} defaultValue={`${b.place} (${i.period})`} />
                  </label>
                  <div className="actions">
                    <Button type="submit" disabled={busy}>
                      {t.expenseSave}
                    </Button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">{t.noInvoice}</p>
      )}
      {can.manage && (
        <form className="form-grid booking-invoice-form" onSubmit={addInvoice}>
          <label htmlFor={`${base}-period`}>
            {t.period}
            <select id={`${base}-period`} name="period" defaultValue={b.periods[0]?.period ?? ""}>
              {b.periods.map((p) => (
                <option key={p.period} value={p.period}>
                  {p.period} ({euros(locale, p.cents)})
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={`${base}-amount`}>
            {t.amount}
            <input id={`${base}-amount`} name="amount" type="number" min={0} step="0.01" required />
          </label>
          <label htmlFor={`${base}-issued`}>
            {t.issuedOn}
            <input id={`${base}-issued`} name="issuedOn" type="date" required />
          </label>
          <label htmlFor={`${base}-file`}>
            {t.file}
            <input id={`${base}-file`} name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" />
          </label>
          <div className="actions">
            <Button type="submit" disabled={busy || !b.periods.length}>
              {t.addInvoice}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
