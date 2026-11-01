"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { workshopView } from "@/domains/equipment/workshop";
import { interventionKinds } from "@/domains/equipment/workshop";
import { workshopCopy } from "./workshop-copy";
import { fill } from "./fleet-copy";
import { errors } from "./access-copy";
import { Badge, EmptyState, Panel } from "./ui";
import { Icon } from "./icons";

/**
 * B3: the chairs' workshop. On the equipment page, what needs attention and
 * the chairs for the next events (a club chair booked for a player without
 * one); in a chair's sheet, its log of interventions, its batteries and
 * chargers, its speed, its warranty and funding, its cost and its report;
 * and « Signaler une panne » for whoever uses the chair.
 */
type WView = Awaited<ReturnType<typeof workshopView>>;
type WChair = NonNullable<WView["chair"]>;
type Send = (body: Record<string, unknown>) => Promise<{ id: string } | null>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const day = (l: Locale, d: string | null) => (d ? new Intl.DateTimeFormat(tag(l), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z")) : "…");
const when = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(d));
const euros = (l: Locale, cents: number) => new Intl.NumberFormat(tag(l), { style: "currency", currency: "EUR" }).format(cents / 100);
/** « 12,50 » or « 12.5 » in euros, to cents; empty gives null. */
const cents = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(",", ".").trim();
  return s === "" ? null : Math.round(Number(s) * 100);
};
const failureOf = (l: Locale, code: string) => workshopCopy[l].errors[code] ?? errors[code]?.[l] ?? workshopCopy[l].unavailable;
const speedTones = { ok: "success", missing: "warning", old: "warning", over: "danger" } as const;

function useWorkshop(locale: Locale, chairId?: string) {
  const t = workshopCopy[locale];
  const [view, setView] = useState<WView | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const url = "/api/equipment/workshop" + (chairId ? `?chair=${chairId}` : "");
  useEffect(() => {
    let cancelled = false;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!cancelled) setView(v);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(failureOf(locale, e.message));
      });
    return () => {
      cancelled = true;
    };
  }, [url, revision, locale]);
  const send: Send = async (body) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/equipment/workshop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: view?.organization_id }) });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setMessage(t.saved);
      setRevision((n) => n + 1);
      return v as { id: string };
    } catch (e) {
      setError(failureOf(locale, e instanceof Error ? e.message : ""));
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { view, error, message, busy, send };
}

/** The « Atelier » tab of the equipment page. */
export function WorkshopOverview({ locale }: { locale: Locale }) {
  const t = workshopCopy[locale];
  const { view, error, message, busy, send } = useWorkshop(locale);
  return (
    <div className="workshop">
      <p className="muted">{t.intro}</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!view && !error && <p role="status">{t.loading}</p>}
      {view && view.can.manage && (
        <Panel title={t.alerts} id="workshop-alerts">
          {view.alerts.length ? (
            <ul className="records workshop-alerts">
              {view.alerts.map((a, i) => (
                <li key={a.kind + a.id + i}>
                  <Badge tone={a.kind === "report" || a.kind === "loan" ? "danger" : "warning"}>{t.alertKinds[a.kind]}</Badge>{" "}
                  {a.chair ? <Link href={`/${locale}/equipment/${a.chair}`}>{a.about}</Link> : <strong>{a.about}</strong>}
                  <span className="muted"> · {a.kind === "speed" ? t.speedStates[a.detail as keyof typeof t.speedStates] : a.kind === "warranty" || a.kind === "service" || a.kind === "supply" ? day(locale, a.detail) : a.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t.noAlerts}</p>
          )}
        </Panel>
      )}
      {view && view.can.follow && (
        <Panel title={t.availability} id="workshop-availability">
          {view.availability.length ? (
            view.availability.map((e) => <EventChairs key={e.id} locale={locale} event={e} busy={busy} send={send} />)
          ) : (
            <EmptyState title={t.noEvents} />
          )}
        </Panel>
      )}
      {view && view.can.manage && <SpeedRules key={`${view.rules.limit}-${view.rules.days}`} locale={locale} rules={view.rules} busy={busy} send={send} />}
    </div>
  );
}
function EventChairs({ locale, event, busy, send }: { locale: Locale; event: WView["availability"][number]; busy: boolean; send: Send }) {
  const t = workshopCopy[locale];
  const head = `workshop-event-${event.id}`;
  return (
    <section className="workshop-event" aria-labelledby={head}>
      <h3 id={head}>
        {event.title} <span className="muted small">· {when(locale, event.starts_at)}</span>
      </h3>
      <p>
        {fill(t.expected, { n: event.players.length })}
        {event.missing.length ? (
          <>
            {" "}
            <Badge tone="danger">{fill(t.missing, { n: event.missing.length })}</Badge>
          </>
        ) : (
          <span className="muted"> · {t.allSet}</span>
        )}
      </p>
      <ul className="records">
        {event.players.map((p) => {
          const own = p.own && (p.own.status === "available" || p.own.status === "in_use");
          return (
            <li key={p.profile_id} className="link-row">
              <span>
                <strong>{p.full_name}</strong>{" "}
                {p.booking ? (
                  <span>{fill(t.booked, { chair: p.booking.name })}</span>
                ) : own ? (
                  <span className="muted">{fill(t.own, { chair: p.own!.name })}</span>
                ) : (
                  <Badge tone="danger">{t.noChair}</Badge>
                )}
              </span>
              {p.booking ? (
                <button type="button" className="button secondary sm" disabled={busy} onClick={() => void send({ action: "release", id: p.booking!.id })}>
                  {t.release}
                  <span className="sr-only"> : {p.full_name}</span>
                </button>
              ) : (
                !own &&
                (event.free.length ? (
                  <BookForm locale={locale} eventId={event.id} profileId={p.profile_id} name={p.full_name} free={event.free} busy={busy} send={send} />
                ) : (
                  <span className="muted small">{t.noFree}</span>
                ))
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BookForm({ locale, eventId, profileId, name, free, busy, send }: { locale: Locale; eventId: string; profileId: string; name: string; free: { id: string; name: string }[]; busy: boolean; send: Send }) {
  const t = workshopCopy[locale];
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        void send({ action: "book", eventId, profileId, chairId: new FormData(e.currentTarget).get("chair") });
      }}
    >
      <label>
        <span className="sr-only">{fill(t.chairOf, { name })}</span>
        <select name="chair" required defaultValue={free[0]?.id}>
          {free.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <button className="button sm" disabled={busy}>
        {t.book}
        <span className="sr-only"> : {name}</span>
      </button>
    </form>
  );
}

function SpeedRules({ locale, rules, busy, send }: { locale: Locale; rules: WView["rules"]; busy: boolean; send: Send }) {
  const t = workshopCopy[locale];
  return (
    <Panel title={t.rules} id="workshop-rules">
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void send({ action: "speedRules", limitKmh: Number(String(d.get("limit")).replace(",", ".")), checkDays: Number(d.get("days")) });
        }}
      >
        <div className="form-grid">
          <label>
            {t.limit}
            <input name="limit" type="number" min="1" max="20" step="0.1" required defaultValue={rules.limit} />
          </label>
          <label>
            {t.checkDays}
            <input name="days" type="number" min="7" max="730" step="1" required defaultValue={rules.days} />
          </label>
        </div>
        <p>
          <button className="button" disabled={busy}>
            {t.save}
          </button>
        </p>
      </form>
    </Panel>
  );
}

/** The « Atelier » tab of a chair's sheet, for the material managers. */
export function ChairWorkshop({ locale, chairId }: { locale: Locale; chairId: string }) {
  const t = workshopCopy[locale];
  const { view, error, message, busy, send } = useWorkshop(locale, chairId);
  const chair = view?.chair;
  return (
    <div className="workshop chair-workshop">
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!view && !error && <p role="status">{t.loading}</p>}
      {view && chair && (
        <>
          <section aria-labelledby={`ws-speed-${chair.id}`}>
            <h3 id={`ws-speed-${chair.id}`}>{t.speed}</h3>
            <p>
              {chair.speed.kmh !== null ? fill(t.lastSpeed, { kmh: chair.speed.kmh, date: day(locale, chair.speed.on) }) : t.never} <Badge tone={speedTones[chair.speed.state]}>{t.speedStates[chair.speed.state]}</Badge>
            </p>
            <p className="muted small">{fill(t.clubLimit, { limit: view.rules.limit, days: view.rules.days })}</p>
          </section>
          <Interventions locale={locale} view={view} chair={chair} busy={busy} send={send} />
          <Components locale={locale} chair={chair} today={view.today} busy={busy} send={send} />
          <Funding key={chair.id + (chair.warranty_until ?? "") + (chair.purchase_value_cents ?? "") + (chair.grant_id ?? "") + (chair.partner_id ?? "") + (chair.pot_id ?? "")} locale={locale} view={view} chair={chair} busy={busy} send={send} />
          {chair.cost && (
            <section aria-labelledby={`ws-cost-${chair.id}`}>
              <h3 id={`ws-cost-${chair.id}`}>{t.ownership}</h3>
              <dl className="chair-facts">
                <dt>{t.purchase.replace(" (€)", "")}</dt>
                <dd>{euros(locale, chair.cost.purchase)}</dd>
                <dt>{t.upkeep}</dt>
                <dd>{euros(locale, chair.cost.upkeep)}</dd>
                <dt>{t.total}</dt>
                <dd>
                  <strong>{euros(locale, chair.cost.total)}</strong>
                </dd>
                <dt>{t.daysOutTotal}</dt>
                <dd>{chair.cost.daysOut}</dd>
              </dl>
              <p className="actions">
                <a className="button secondary" href={`/api/equipment/workshop/report?chair=${chair.id}&format=xlsx`}>
                  <Icon name="download" size={16} />
                  {t.report} · {t.xlsx}
                </a>
                <a className="button secondary" href={`/api/equipment/workshop/report?chair=${chair.id}&format=pdf`} target="_blank" rel="noopener">
                  <Icon name="download" size={16} />
                  {t.report} · {t.pdf}
                </a>
              </p>
            </section>
          )}
          <section aria-labelledby={`ws-reports-${chair.id}`}>
            <h3 id={`ws-reports-${chair.id}`}>{t.reports}</h3>
            {chair.reports.length ? (
              <ul className="records">
                {chair.reports.map((r) => (
                  <li key={r.id} className="link-row">
                    <span>
                      <Badge tone={r.status === "open" ? "danger" : "neutral"}>{r.status === "open" ? t.reportOpen : t.reportClosed}</Badge> {r.description}
                      <span className="muted small">
                        {" "}
                        · {when(locale, r.created_at)}
                        {r.has_photo ? ` · ${t.withPhoto}` : ""}
                      </span>
                    </span>
                    {r.status === "open" && (
                      <button type="button" className="button secondary sm" disabled={busy} onClick={() => void send({ action: "closeReport", id: r.id })}>
                        {t.closeReport}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t.noReports}</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Interventions({ locale, view, chair, busy, send }: { locale: Locale; view: WView; chair: WChair; busy: boolean; send: Send }) {
  const t = workshopCopy[locale];
  const [kind, setKind] = useState<(typeof interventionKinds)[number]>("service");
  const formRef = useRef<HTMLFormElement>(null);
  const id = (k: string) => `ws-${chair.id}-${k}`;
  const out = chair.status === "maintenance" || chair.status === "out_of_service";
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const v = (k: string) => String(d.get(k) ?? "").trim();
    void send({
      action: "intervention",
      chairId: chair.id,
      occurredOn: v("on"),
      kind,
      diagnosis: v("diagnosis"),
      parts: v("parts"),
      supplierContactId: v("supplier") || null,
      costCents: cents(d.get("cost")),
      daysOut: Number(v("daysOut") || 0),
      transactionId: v("invoice") || null,
      speedKmh: kind === "speed_check" ? Number(v("speed").replace(",", ".")) : null,
      checker: v("checker"),
      backInService: d.get("back") === "on",
    }).then((r) => {
      if (r) formRef.current?.reset();
    });
  }
  return (
    <section aria-labelledby={id("log")}>
      <h3 id={id("log")}>{t.interventions}</h3>
      {chair.interventions.length ? (
        <ul className="records workshop-log">
          {chair.interventions.map((i) => (
            <li key={i.id}>
              <strong>{t.kinds[i.kind as keyof typeof t.kinds]}</strong>
              <span className="muted">
                {" "}
                · {day(locale, i.occurred_on)}
                {i.cost_cents !== null && ` · ${euros(locale, i.cost_cents)}`}
                {i.days_out > 0 && ` · ${t.daysOut} : ${i.days_out}`}
                {i.speed_kmh !== null && ` · ${i.speed_kmh} km/h`}
              </span>
              {i.cancelled_at && (
                <>
                  {" "}
                  <Badge tone="neutral">{fill(t.cancelled, { reason: i.cancel_reason ?? "" })}</Badge>
                </>
              )}
              {[i.diagnosis, i.parts, i.supplier && `${t.supplier} : ${i.supplier}`, i.invoice && `${t.invoice} : ${i.invoice}`, i.checker && `${t.checker} : ${i.checker}`].filter(Boolean).length > 0 && (
                <p className="muted small">{[i.diagnosis, i.parts, i.supplier && `${t.supplier} : ${i.supplier}`, i.invoice && `${t.invoice} : ${i.invoice}`, i.checker && `${t.checker} : ${i.checker}`].filter(Boolean).join(" · ")}</p>
              )}
              {!i.cancelled_at && (
                <details className="inline-details">
                  <summary>{t.cancelIntervention}</summary>
                  <form
                    className="inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send({ action: "cancelIntervention", id: i.id, reason: String(new FormData(e.currentTarget).get("reason") ?? "").trim() });
                    }}
                  >
                    <label>
                      {t.cancelReason}
                      <input name="reason" required minLength={5} maxLength={300} />
                    </label>
                    <button className="button secondary sm" disabled={busy}>
                      {t.cancelIntervention}
                    </button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t.noInterventions}</p>
      )}
      <h4>{t.addIntervention}</h4>
      <form ref={formRef} className="stack-form" onSubmit={submit}>
        <div className="form-grid">
          <label htmlFor={id("on")}>
            {t.date}
            <input id={id("on")} name="on" type="date" required max={view.today} defaultValue={view.today} />
          </label>
          <label htmlFor={id("kind")}>
            {t.kind}
            <select id={id("kind")} name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {interventionKinds.map((k) => (
                <option key={k} value={k}>
                  {t.kinds[k]}
                </option>
              ))}
            </select>
          </label>
          {kind === "speed_check" && (
            <>
              <label htmlFor={id("speed")}>
                {t.speedKmh}
                <input id={id("speed")} name="speed" type="number" min="0" max="30" step="0.1" required />
              </label>
              <label htmlFor={id("checker")}>
                {t.checker}
                <input id={id("checker")} name="checker" maxLength={120} />
              </label>
            </>
          )}
          <label htmlFor={id("cost")}>
            {t.cost}
            <input id={id("cost")} name="cost" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" />
          </label>
          <label htmlFor={id("daysOut")}>
            {t.daysOut}
            <input id={id("daysOut")} name="daysOut" type="number" min="0" max="3650" step="1" defaultValue={0} />
          </label>
          {view.choices && (
            <label htmlFor={id("supplier")}>
              {t.supplier}
              <select id={id("supplier")} name="supplier" defaultValue="">
                <option value="">{t.none}</option>
                {view.choices.contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {view.choices && (
            <label htmlFor={id("invoice")}>
              {t.invoice}
              <select id={id("invoice")} name="invoice" defaultValue="" aria-describedby={id("invoice-help")}>
                <option value="">{t.none}</option>
                {view.choices.expenses.map((x) => (
                  <option key={x.id} value={x.id}>
                    {`${day(locale, x.occurred_on)} · ${x.label} · ${euros(locale, x.amount_cents)}`}
                  </option>
                ))}
              </select>
              <span id={id("invoice-help")} className="field-help">
                {t.invoiceHint}
              </span>
            </label>
          )}
        </div>
        <label htmlFor={id("diagnosis")}>
          {t.diagnosis}
          <textarea id={id("diagnosis")} name="diagnosis" rows={2} maxLength={1000} />
        </label>
        <label htmlFor={id("parts")}>
          {t.parts}
          <input id={id("parts")} name="parts" maxLength={500} />
        </label>
        {out && (
          <label className="check">
            <input type="checkbox" name="back" />
            {t.backInService}
          </label>
        )}
        <p>
          <button className="button" disabled={busy}>
            {t.addIntervention}
          </button>
        </p>
      </form>
    </section>
  );
}

function Components({ locale, chair, today, busy, send }: { locale: Locale; chair: WChair; today: string; busy: boolean; send: Send }) {
  const t = workshopCopy[locale];
  const formRef = useRef<HTMLFormElement>(null);
  const id = (k: string) => `wc-${chair.id}-${k}`;
  const parts = chair.components as { id: string; kind: "battery" | "charger"; label: string; serial: string; in_service_on: string | null; retired_on: string | null }[];
  return (
    <section aria-labelledby={id("head")}>
      <h3 id={id("head")}>{t.components}</h3>
      {parts.length ? (
        <ul className="records">
          {parts.map((c) => (
            <li key={c.id}>
              <strong>{t.componentKinds[c.kind]}</strong> · {c.label}
              <span className="muted small">
                {c.serial && ` · ${c.serial}`}
                {c.in_service_on && ` · ${t.since} ${day(locale, c.in_service_on)}`}
                {c.retired_on && ` · ${fill(t.retiredOn, { date: day(locale, c.retired_on) })}`}
              </span>
              {!c.retired_on && (
                <details className="inline-details">
                  <summary>{fill(t.replaceOf, { label: c.label })}</summary>
                  <form
                    className="stack-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      void send({ action: "replaceComponent", id: c.id, on: d.get("on"), label: String(d.get("label") ?? "").trim(), serial: String(d.get("serial") ?? "").trim() });
                    }}
                  >
                    <div className="form-grid">
                      <label>
                        {t.newLabel}
                        <input name="label" required minLength={2} maxLength={120} defaultValue={c.label} />
                      </label>
                      <label>
                        {t.serial}
                        <input name="serial" maxLength={80} />
                      </label>
                      <label>
                        {t.date}
                        <input name="on" type="date" required max={today} defaultValue={today} />
                      </label>
                    </div>
                    <p>
                      <button className="button secondary sm" disabled={busy}>
                        {t.replace}
                      </button>
                    </p>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t.noComponents}</p>
      )}
      <form
        ref={formRef}
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void send({ action: "component", chairId: chair.id, kind: d.get("kind"), label: String(d.get("label") ?? "").trim(), serial: String(d.get("serial") ?? "").trim(), inServiceOn: d.get("since") || null }).then((r) => {
            if (r) formRef.current?.reset();
          });
        }}
      >
        <div className="form-grid">
          <label htmlFor={id("kind")}>
            {t.kind}
            <select id={id("kind")} name="kind" defaultValue="battery">
              <option value="battery">{t.componentKinds.battery}</option>
              <option value="charger">{t.componentKinds.charger}</option>
            </select>
          </label>
          <label htmlFor={id("label")}>
            {t.label}
            <input id={id("label")} name="label" required minLength={2} maxLength={120} />
          </label>
          <label htmlFor={id("serial")}>
            {t.serial}
            <input id={id("serial")} name="serial" maxLength={80} />
          </label>
          <label htmlFor={id("since")}>
            {t.since}
            <input id={id("since")} name="since" type="date" max={today} />
          </label>
        </div>
        <p>
          <button className="button secondary" disabled={busy}>
            {t.addComponent}
          </button>
        </p>
      </form>
    </section>
  );
}

function Funding({ locale, view, chair, busy, send }: { locale: Locale; view: WView; chair: WChair; busy: boolean; send: Send }) {
  const t = workshopCopy[locale];
  const id = (k: string) => `wf-${chair.id}-${k}`;
  const choices = view.choices;
  if (!choices) return null;
  const pick = (name: "grant" | "partner" | "pot", label: string, list: { id: string; name: string }[], value: string | null) => (
    <label htmlFor={id(name)}>
      {label}
      <select id={id(name)} name={name} defaultValue={value ?? ""}>
        <option value="">{t.none}</option>
        {list.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section aria-labelledby={id("head")}>
      <h3 id={id("head")}>{t.funding}</h3>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void send({
            action: "chairExtras",
            chairId: chair.id,
            warrantyUntil: d.get("warranty") || null,
            purchaseValueCents: cents(d.get("purchase")),
            grantId: d.get("grant") || null,
            partnerId: d.get("partner") || null,
            potId: d.get("pot") || null,
          });
        }}
      >
        <div className="form-grid">
          <label htmlFor={id("warranty")}>
            {t.warranty}
            <input id={id("warranty")} name="warranty" type="date" defaultValue={chair.warranty_until ?? ""} />
          </label>
          <label htmlFor={id("purchase")}>
            {t.purchase}
            <input id={id("purchase")} name="purchase" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" defaultValue={chair.purchase_value_cents === null ? "" : String(chair.purchase_value_cents / 100)} />
          </label>
          {pick("grant", t.grant, choices.grants, chair.grant_id)}
          {pick("partner", t.partner, choices.partners, chair.partner_id)}
          {pick("pot", t.pot, choices.pots, chair.pot_id)}
        </div>
        <p>
          <button className="button" disabled={busy}>
            {t.save}
          </button>
        </p>
      </form>
    </section>
  );
}

/** « Signaler une panne »: a button and its window, for whoever sees the chair. */
export function ReportBreakdown({ locale, chairId, chairName, organizationId, done }: { locale: Locale; chairId: string; chairName: string; organizationId: string; done: () => void }) {
  const t = workshopCopy[locale];
  const [open, setOpen] = useState(false),
    [message, setMessage] = useState("");
  return (
    <div className="report-breakdown">
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          setMessage("");
          setOpen(true);
        }}
      >
        <Icon name="alert" size={16} />
        {t.reportButton}
      </button>
      {message && <p role="status">{message}</p>}
      {open && (
        <ReportDialog
          locale={locale}
          chairId={chairId}
          chairName={chairName}
          organizationId={organizationId}
          close={() => setOpen(false)}
          sent={() => {
            setOpen(false);
            setMessage(t.reported);
            done();
          }}
        />
      )}
    </div>
  );
}

function ReportDialog({ locale, chairId, chairName, organizationId, close, sent }: { locale: Locale; chairId: string; chairName: string; organizationId: string; close: () => void; sent: () => void }) {
  const t = workshopCopy[locale];
  const ref = useRef<HTMLDialogElement>(null);
  const [photo, setPhoto] = useState<{ type: string; data: string } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const title = `report-title-${chairId}`;
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  function choose(file: File | undefined) {
    setError("");
    setPhoto(null);
    if (!file) return;
    if (file.size > 1048576) {
      setError(t.photoTooBig);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto({ type: file.type, data: String(reader.result).split(",")[1] ?? "" });
    reader.readAsDataURL(file);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const description = String(new FormData(e.currentTarget).get("description") ?? "").trim();
      const r = await fetch("/api/equipment/workshop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "report", chairId, description, photo, organizationId }) });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      ref.current?.close();
      sent();
    } catch (err) {
      setError(failureOf(locale, err instanceof Error ? err.message : ""));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog ref={ref} className="player-dialog" aria-labelledby={title} onCancel={close}>
      <div className="dialog-heading">
        <h2 id={title}>{fill(t.reportTitle, { chair: chairName })}</h2>
      </div>
      <form className="stack-form" onSubmit={(e) => void submit(e)}>
        {error && <p role="alert">{error}</p>}
        <label htmlFor={`${title}-what`}>
          {t.describe}
          <textarea id={`${title}-what`} name="description" rows={3} required minLength={3} maxLength={1000} />
        </label>
        <label htmlFor={`${title}-photo`}>
          {t.photo}
          <input id={`${title}-photo`} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-describedby={`${title}-hint`} onChange={(e) => choose(e.target.files?.[0])} />
          <span id={`${title}-hint`} className="field-help">
            {t.photoHint}
          </span>
        </label>
        <p className="actions">
          <button className="button" disabled={busy}>
            {t.send}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              ref.current?.close();
              close();
            }}
          >
            {t.cancel}
          </button>
        </p>
      </form>
    </dialog>
  );
}
