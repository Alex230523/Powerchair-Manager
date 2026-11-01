"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { openEventsView } from "@/domains/open-events/service";
import { openEventsCopy } from "./open-events-copy";
import { parseQuestions, unparseQuestions as unparse } from "@/domains/open-events/questions";
import { fill } from "./fleet-copy";
import { errors } from "./access-copy";
import { Badge, Button, EmptyState, PageHeader, Panel, Tabs } from "./ui";

/**
 * B9: the club's open events. Open a calendar appointment (or its whole
 * series) to the public, share its link, follow the registered people and
 * the waiting list, check in at the door, read the opinions, write to all,
 * export, cancel.
 */
type View = Awaited<ReturnType<typeof openEventsView>>;
type Detail = NonNullable<View["detail"]>;
type Send = (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const when = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(d));
const windowTones = { before: "neutral", open: "success", closed: "warning" } as const;
const statusTones = { confirmed: "success", waiting: "warning", offered: "info", cancelled: "neutral" } as const;
/** A date-time field's value (local time) for an instant. */
const local = (d: Date) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const v = (k: string) => p.find((x) => x.type === k)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}`;
};

export function OpenEvents({ locale }: { locale: Locale }) {
  const t = openEventsCopy[locale];
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [opening, setOpening] = useState<number | null>(null);
  const failure = (code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable;
  useEffect(() => {
    let cancelled = false;
    fetch("/api/open-events" + (selected ? `?id=${selected}` : ""), { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!cancelled) setView(v);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(failure(e.message));
      });
    return () => {
      cancelled = true;
    };
    // The copy only changes with the locale, which reloads the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, revision]);
  const send: Send = async (body) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/open-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: view?.organization_id }) });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setMessage(body.action === "message" ? t.sent : t.saved);
      setRevision((n) => n + 1);
      return v;
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
      return null;
    } finally {
      setBusy(false);
    }
  };
  return (
    <main id="main" className="access open-events">
      <PageHeader
        title={t.title}
        subtitle={t.intro}
        actions={
          view ? (
            <Button
              onClick={() => {
                setMessage("");
                setOpening(Date.now());
              }}
            >
              {t.open}
            </Button>
          ) : undefined
        }
      />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!view && !error && <p role="status">{t.loading}</p>}
      {view && (
        <>
          {view.events.length ? (
            <ul className="incident-list">
              {view.events.map((e) => (
                <li key={e.id} className="card incident-card">
                  <h2 className="incident-title">
                    {e.title} <span className="muted small">· {when(locale, e.starts_at)}</span>
                  </h2>
                  <p>
                    {e.status === "cancelled" ? <Badge tone="danger">{t.eventCancelled}</Badge> : <Badge tone={windowTones[e.window]}>{t.window[e.window]}</Badge>}{" "}
                    <span className="muted">{fill(t.counts, { confirmed: e.confirmed, waiting: e.waiting, present: e.present })}</span>
                  </p>
                  <p className="actions">
                    <Button variant={selected === e.id ? "primary" : "secondary"} size="sm" aria-expanded={selected === e.id} onClick={() => setSelected(selected === e.id ? null : e.id)}>
                      {t.tabs.people}
                      <span className="sr-only"> : {e.title}</span>
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        void navigator.clipboard
                          ?.writeText(`${window.location.origin}/${locale}/evenement/${e.token}`)
                          .then(() => setMessage(t.copied))
                          .catch(() => setMessage(`${window.location.origin}/${locale}/evenement/${e.token}`))
                      }
                    >
                      {t.copy}
                      <span className="sr-only"> : {e.title}</span>
                    </Button>
                    <Link className="button secondary sm" href={`/${locale}/evenement/${e.token}`} target="_blank" rel="noopener">
                      {t.link}
                      <span className="sr-only"> : {e.title}</span>
                    </Link>
                  </p>
                  {selected === e.id && view.detail?.id === e.id && <EventDetail key={view.detail.id} locale={locale} detail={view.detail} busy={busy} send={send} />}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t.noEvents} />
          )}
          {opening !== null && <OpenDialog locale={locale} candidates={view.candidates} now={opening} busy={busy} send={send} close={() => setOpening(null)} />}
        </>
      )}
    </main>
  );
}

function OpenDialog({ locale, candidates, now, busy, send, close }: { locale: Locale; candidates: View["candidates"]; now: number; busy: boolean; send: Send; close: () => void }) {
  const t = openEventsCopy[locale];
  const ref = useRef<HTMLDialogElement>(null);
  const [eventId, setEventId] = useState(candidates[0]?.id ?? "");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const chosen = candidates.find((c) => c.id === eventId);
  // Default window: from now until the day before the event (or one hour before it).
  const closesDefault = chosen ? new Date(Math.max(now + 3600000, new Date(chosen.starts_at).getTime() - 86400000)) : new Date(now + 86400000);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const v = (k: string) => String(d.get(k) ?? "").trim();
    const fee = v("fee").replace(",", ".");
    const r = await send({
      action: "open",
      eventId,
      series: d.get("series") === "on",
      description: v("description"),
      capacity: v("capacity") ? Number(v("capacity")) : null,
      opensAt: new Date(v("opens")).toISOString(),
      closesAt: new Date(v("closes")).toISOString(),
      feeCents: fee ? Math.round(Number(fee) * 100) : 0,
      confirmHours: Number(v("hours") || 48),
      reminders: d.get("reminders") === "on",
      survey: d.get("survey") === "on",
      questions: parseQuestions(v("questions")),
      surveyQuestions: parseQuestions(v("surveyQuestions")).slice(0, 10),
    });
    if (r) {
      ref.current?.close();
      close();
    }
  }
  return (
    <dialog ref={ref} className="player-dialog sheet-dialog" aria-labelledby="open-event-title" onCancel={close}>
      <div className="dialog-heading sheet-heading">
        <h2 id="open-event-title">{t.openTitle}</h2>
        <button
          type="button"
          className="button secondary sm"
          onClick={() => {
            ref.current?.close();
            close();
          }}
        >
          {t.close}
        </button>
      </div>
      {candidates.length ? (
        <form className="stack-form" onSubmit={(e) => void submit(e)}>
          <label htmlFor="oe-event">
            {t.event}
            <select id="oe-event" value={eventId} onChange={(e) => setEventId(e.target.value)} required>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.title} · ${when(locale, c.starts_at)}`}
                </option>
              ))}
            </select>
          </label>
          {chosen && chosen.dates > 1 && (
            <label className="check">
              <input type="checkbox" name="series" />
              {t.series}
            </label>
          )}
          <label htmlFor="oe-description">
            {t.description}
            <textarea id="oe-description" name="description" rows={3} maxLength={4000} />
          </label>
          <div className="form-grid" key={eventId}>
            <label htmlFor="oe-capacity">
              {t.capacity}
              <input id="oe-capacity" name="capacity" type="number" min="1" max="10000" aria-describedby="oe-capacity-help" />
              <span id="oe-capacity-help" className="field-help">
                {t.capacityHint}
              </span>
            </label>
            <label htmlFor="oe-opens">
              {t.opensAt}
              <input id="oe-opens" name="opens" type="datetime-local" required defaultValue={local(new Date(now))} />
            </label>
            <label htmlFor="oe-closes">
              {t.closesAt}
              <input id="oe-closes" name="closes" type="datetime-local" required defaultValue={local(closesDefault)} />
            </label>
            <label htmlFor="oe-fee">
              {t.fee}
              <input id="oe-fee" name="fee" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" aria-describedby="oe-fee-help" />
              <span id="oe-fee-help" className="field-help">
                {t.feeHint}
              </span>
            </label>
            <label htmlFor="oe-hours">
              {t.confirmHours}
              <input id="oe-hours" name="hours" type="number" min="1" max="168" defaultValue={48} aria-describedby="oe-hours-help" />
              <span id="oe-hours-help" className="field-help">
                {t.confirmHint}
              </span>
            </label>
          </div>
          <label htmlFor="oe-questions">
            {t.questions}
            <textarea id="oe-questions" name="questions" rows={3} aria-describedby="oe-questions-help" />
            <span id="oe-questions-help" className="field-help">
              {t.questionsHint}
            </span>
          </label>
          <label className="check">
            <input type="checkbox" name="reminders" defaultChecked />
            {t.reminders}
          </label>
          <label className="check">
            <input type="checkbox" name="survey" defaultChecked />
            {t.survey}
          </label>
          <label htmlFor="oe-survey">
            {t.surveyQuestions}
            <textarea id="oe-survey" name="surveyQuestions" rows={2} aria-describedby="oe-survey-help" />
            <span id="oe-survey-help" className="field-help">
              {t.surveyHint}
            </span>
          </label>
          <p>
            <button className="button" disabled={busy || !eventId}>
              {t.open}
            </button>
          </p>
        </form>
      ) : (
        <EmptyState title={t.noCandidates} action={<Link href={`/${locale}/calendar`}>{openEventsCopy[locale].event}</Link>} />
      )}
    </dialog>
  );
}

function EventDetail({ locale, detail, busy, send }: { locale: Locale; detail: Detail; busy: boolean; send: Send }) {
  const t = openEventsCopy[locale];
  const [tab, setTab] = useState<"people" | "checkin" | "opinions">("people");
  const people = detail.registrations;
  const panel = `oe-panel-${detail.id}`;
  return (
    <div className="open-event-detail">
      <Tabs label={t.tabsLabel} items={(["people", "checkin", "opinions"] as const).map((k) => ({ id: k, label: t.tabs[k] }))} value={tab} onChange={(v) => setTab(v as typeof tab)} panelId={panel} idPrefix={`oe-tab-${detail.id}`} />
      <div id={panel} role="tabpanel" aria-labelledby={`oe-tab-${detail.id}-${tab}`}>
        {tab === "people" && (
          <>
            {people.length ? (
              <ul className="records">
                {people.map((r) => (
                  <li key={r.id} className="link-row">
                    <span>
                      <strong>{r.full_name}</strong> <Badge tone={statusTones[r.status]}>{t.statuses[r.status]}</Badge>
                      <span className="muted small">
                        {" "}
                        · {r.email}
                        {(["wheelchair", "helper", "transport"] as const)
                          .filter((k) => r.needs[k])
                          .map((k) => ` · ${t.needLabels[k]}`)
                          .join("")}
                        {r.needs.diet ? ` · ${t.diet} : ${String(r.needs.diet)}` : ""}
                        {` · ${r.consent_image ? t.image : t.noImage}`}
                      </span>
                      {detail.fee_cents > 0 && r.status === "confirmed" && (
                        <>
                          {" "}
                          <Badge tone={r.paid_cents >= detail.fee_cents ? "success" : "warning"}>{r.paid_cents >= detail.fee_cents ? t.paid : t.unpaid}</Badge>
                        </>
                      )}
                    </span>
                    <span className="actions">
                      {detail.fee_cents > 0 && r.status === "confirmed" && r.paid_cents < detail.fee_cents && (
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void send({ action: "paid", registrationId: r.id })}>
                          {t.markPaid}
                          <span className="sr-only"> : {r.full_name}</span>
                        </Button>
                      )}
                      {r.status !== "cancelled" && (
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void send({ action: "remove", registrationId: r.id })}>
                          {t.removeRegistration}
                          <span className="sr-only"> : {r.full_name}</span>
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t.noPeople}</p>
            )}
            <p className="actions">
              <a className="button secondary" href={`/api/open-events/export?id=${detail.id}`}>
                {t.export}
              </a>
            </p>
            <details className="inline-details">
              <summary>{t.message}</summary>
              <form
                className="stack-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  void send({ action: "message", id: detail.id, subject: String(d.get("subject") ?? "").trim(), body: String(d.get("body") ?? "").trim() });
                }}
              >
                <label htmlFor={`oe-subject-${detail.id}`}>
                  {t.subject}
                  <input id={`oe-subject-${detail.id}`} name="subject" required minLength={2} maxLength={150} />
                </label>
                <label htmlFor={`oe-body-${detail.id}`}>
                  {t.body}
                  <textarea id={`oe-body-${detail.id}`} name="body" rows={4} required minLength={2} maxLength={4000} />
                </label>
                <p>
                  <button className="button" disabled={busy}>
                    {t.send}
                  </button>
                </p>
              </form>
            </details>
            {detail.status === "open" && (
              <details className="inline-details">
                <summary>{t.cancelEvent}</summary>
                <form
                  className="stack-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send({ action: "cancelEvent", id: detail.id, reason: String(new FormData(e.currentTarget).get("reason") ?? "").trim() });
                  }}
                >
                  <label htmlFor={`oe-reason-${detail.id}`}>
                    {t.cancelReason}
                    <input id={`oe-reason-${detail.id}`} name="reason" maxLength={500} />
                  </label>
                  <p>
                    <button className="button danger" disabled={busy}>
                      {t.cancelEvent}
                    </button>
                  </p>
                </form>
              </details>
            )}
            <p className="field-help">
              {t.questions} : {unparse(detail.questions).replace(/\n/g, " · ") || "…"}
            </p>
          </>
        )}
        {tab === "checkin" && (
          <>
            <p className="field-help">{t.scanHint}</p>
            <ul className="records">
              {people
                .filter((r) => r.status === "confirmed")
                .map((r) => (
                  <li key={r.id} className="link-row">
                    <strong>{r.full_name}</strong>
                    {r.checked_in_at ? (
                      <Badge tone="success">{t.checkedIn}</Badge>
                    ) : (
                      <Button size="sm" disabled={busy} onClick={() => void send({ action: "checkin", registrationId: r.id })}>
                        {t.checkIn}
                        <span className="sr-only"> : {r.full_name}</span>
                      </Button>
                    )}
                  </li>
                ))}
            </ul>
          </>
        )}
        {tab === "opinions" && (
          <Panel title={t.opinions} id={`oe-opinions-${detail.id}`}>
            {detail.opinions.count ? (
              <>
                <p>{fill(t.average, { n: String(detail.opinions.average).replace(".", locale === "en" ? "." : ","), count: detail.opinions.count })}</p>
                {detail.opinions.answers.map((a) => (
                  <section key={a.question} aria-label={fill(t.answersOf, { q: a.question })}>
                    <h3>{fill(t.answersOf, { q: a.question })}</h3>
                    <ul className="plain-list">
                      {a.values.map((v, i) => (
                        <li key={i}>{v === true ? t.public.yes : v === false ? t.public.no : String(v)}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </>
            ) : (
              <p className="muted">{t.noOpinions}</p>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

/** The page a registration's QR code opens on the staff's phone: checks the person in. */
export function OpenEventCheckin({ locale, code }: { locale: Locale; code: string }) {
  const t = openEventsCopy[locale].checkinPage;
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/open-events", { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        const c = await fetch("/api/open-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "checkin", code, organizationId: v.organization_id }) });
        const out = await c.json();
        if (!c.ok) throw new Error(out.error);
        return out as { name: string; already: boolean };
      })
      .then((out) => {
        if (!cancelled) setResult({ ok: true, text: fill(out.already ? t.already : t.done, { name: out.name }) });
      })
      .catch(() => {
        if (!cancelled) setResult({ ok: false, text: t.failed });
      });
    return () => {
      cancelled = true;
    };
  }, [code, t]);
  return (
    <main id="main" className="access">
      <PageHeader title={t.title} />
      {!result && <p role="status">…</p>}
      {result && <p role={result.ok ? "status" : "alert"}>{result.text}</p>}
      <p>
        <Link href={`/${locale}/events`}>{t.back}</Link>
      </p>
    </main>
  );
}
