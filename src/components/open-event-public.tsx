"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { publicEvent } from "@/domains/open-events/service";
import { qrMatrix, qrPath } from "@/lib/qr";
import { openEventsCopy } from "./open-events-copy";
import { fill } from "./fleet-copy";
import { TransferQr } from "./transfer-qr";
import { Badge, Button, PageHeader, Panel } from "./ui";

/**
 * B9, public: an open event by its link. Without an account: the event, the
 * places left, the registration (needs, the event's questions, two separate
 * consents). With the personal link: one's status, confirming an offered
 * place, withdrawing, paying by transfer, the entry QR code, the opinion.
 */
type View = Awaited<ReturnType<typeof publicEvent>>;
type Question = View["questions"][number];
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const when = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(d));

function QuestionField({ locale, q, prefix }: { locale: Locale; q: Question; prefix: string }) {
  const t = openEventsCopy[locale].public;
  const fieldId = `${prefix}-${q.id}`;
  if (q.kind === "yesno")
    return (
      <fieldset>
        <legend>
          {q.label}
          {q.required && " *"}
        </legend>
        <label className="check">
          <input type="radio" name={q.id} value="yes" required={q.required} />
          {t.yes}
        </label>
        <label className="check">
          <input type="radio" name={q.id} value="no" />
          {t.no}
        </label>
      </fieldset>
    );
  return (
    <label htmlFor={fieldId}>
      {q.label}
      {q.required && " *"}
      <input id={fieldId} name={q.id} maxLength={1000} required={q.required} />
    </label>
  );
}
const answersOf = (d: FormData, questions: Question[]) =>
  Object.fromEntries(
    questions
      .map((q) => [q.id, q.kind === "yesno" ? (d.get(q.id) === "yes" ? true : d.get(q.id) === "no" ? false : undefined) : String(d.get(q.id) ?? "").trim()] as const)
      .filter(([, v]) => v !== undefined && v !== ""),
  );

export function PublicOpenEvent({ locale, token, registration }: { locale: Locale; token: string; registration?: string }) {
  const c = openEventsCopy[locale],
    t = c.public;
  const [mine, setMine] = useState(registration),
    [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const failure = (code: string) => c.errors[code] ?? (code === "NOT_FOUND" ? t.notFound : c.unavailable);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/open-events/public?token=${token}${mine ? `&r=${mine}` : ""}`, { cache: "no-store" })
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
  }, [token, mine, revision]);
  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/open-events/public", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, token }) });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      return v as { status: string; registration?: string };
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function register(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!view) return;
    const d = new FormData(e.currentTarget);
    const v = (k: string) => String(d.get(k) ?? "").trim();
    const r = await post({
      action: "register",
      fullName: v("fullName"),
      email: v("email"),
      phone: v("phone"),
      needs: { wheelchair: d.get("wheelchair") === "on", helper: d.get("helper") === "on", transport: d.get("transport") === "on", diet: v("diet") },
      answers: answersOf(d, view.questions),
      consentData: d.get("consentData") === "on",
      consentImage: d.get("consentImage") === "on",
      locale,
      website: v("website"),
    });
    if (r?.registration) {
      // The personal link becomes the page's address, to keep or bookmark.
      window.history.replaceState(null, "", `/${locale}/evenement/${token}?r=${r.registration}`);
      setMessage(r.status === "confirmed" ? t.done : t.waiting);
      setMine(r.registration);
    }
  }
  const qr = useMemo(() => {
    const url = view?.registration?.checkin;
    if (!url) return null;
    const m = qrMatrix(url);
    return m ? qrPath(m) : null;
  }, [view?.registration?.checkin]);
  const reg = view?.registration;
  const amount = (cents: number) => new Intl.NumberFormat(tag(locale), { style: "currency", currency: "EUR" }).format(cents / 100);
  return (
    <main id="main" className="access open-event-public">
      <PageHeader title={view?.title ?? c.title} subtitle={view ? `${view.club} · ${when(locale, view.starts_at)}${view.place ? ` · ${view.place}` : ""}` : undefined} />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!view && !error && <p role="status">{c.loading}</p>}
      {view && (
        <>
          {view.description && <p className="open-event-description">{view.description}</p>}
          <p>
            {view.status === "cancelled" ? (
              <Badge tone="danger">{t.cancelled}</Badge>
            ) : (
              <>
                {view.left !== null && <Badge tone={view.left > 0 ? "success" : "warning"}>{view.left > 0 ? fill(t.places, { n: view.left }) : t.full}</Badge>} {view.fee_cents > 0 ? fill(t.feeLine, { amount: amount(view.fee_cents) }) : t.free}
              </>
            )}
          </p>
          {reg ? (
            <Panel title={fill(t.yourStatus, { status: c.statuses[reg.status] })} id="open-event-mine">
              <p className="field-help">{t.keepLink}</p>
              {reg.status === "offered" && reg.offered_until && (
                <>
                  <p>{fill(t.offered, { date: when(locale, reg.offered_until) })}</p>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void post({ action: "confirm", registration: mine }).then((r) => {
                        if (r) setRevision((n) => n + 1);
                      })
                    }
                  >
                    {t.confirm}
                  </Button>
                </>
              )}
              {reg.status === "waiting" && <p>{t.waiting}</p>}
              {reg.payment && (
                <section aria-labelledby="open-event-pay">
                  <h3 id="open-event-pay">{t.pay}</h3>
                  {reg.payment.paid ? <p>{t.paidLine}</p> : reg.payment.account ? <TransferQr locale={locale} payment={reg.payment.account} cents={reg.payment.cents} reference={reg.payment.reference} /> : <p>{fill(t.feeLine, { amount: amount(reg.payment.cents) })}</p>}
                </section>
              )}
              {qr && (
                <figure className="open-event-qr">
                  <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={t.qr} shapeRendering="crispEdges">
                    <rect width={qr.size} height={qr.size} fill="var(--qr-paper)" />
                    <path d={qr.d} fill="var(--qr-ink)" />
                  </svg>
                  <figcaption>{t.qr}</figcaption>
                </figure>
              )}
              {reg.survey && (
                <Survey
                  locale={locale}
                  questions={view.survey_questions}
                  busy={busy}
                  send={(body) =>
                    void post({ action: "feedback", registration: mine, ...body }).then((r) => {
                      if (r) {
                        setMessage(t.thanks);
                        setRevision((n) => n + 1);
                      }
                    })
                  }
                />
              )}
              {reg.status !== "cancelled" && !view.started && (
                <p className="actions">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void post({ action: "withdraw", registration: mine }).then((r) => {
                        if (r) {
                          setMessage(t.withdrawn);
                          setRevision((n) => n + 1);
                        }
                      })
                    }
                  >
                    {t.withdraw}
                  </Button>
                </p>
              )}
            </Panel>
          ) : view.status === "cancelled" ? null : view.window === "before" ? (
            <p className="notice">{fill(t.notYet, { date: when(locale, view.opens_at) })}</p>
          ) : view.window === "closed" ? (
            <p className="notice">{t.over}</p>
          ) : (
            <Panel title={t.register} id="open-event-register">
              <form className="stack-form" onSubmit={(e) => void register(e)}>
                <div className="form-grid">
                  <label htmlFor="oe-name">
                    {t.name}
                    <input id="oe-name" name="fullName" required minLength={2} maxLength={120} autoComplete="name" />
                  </label>
                  <label htmlFor="oe-email">
                    {t.email}
                    <input id="oe-email" name="email" type="email" required maxLength={200} autoComplete="email" />
                  </label>
                  <label htmlFor="oe-phone">
                    {t.phone}
                    <input id="oe-phone" name="phone" type="tel" maxLength={40} autoComplete="tel" />
                  </label>
                </div>
                <fieldset>
                  <legend>{t.needs}</legend>
                  <label className="check">
                    <input type="checkbox" name="wheelchair" />
                    {c.needLabels.wheelchair}
                  </label>
                  <label className="check">
                    <input type="checkbox" name="helper" />
                    {c.needLabels.helper}
                  </label>
                  <label className="check">
                    <input type="checkbox" name="transport" />
                    {c.needLabels.transport}
                  </label>
                  <label htmlFor="oe-diet">
                    {c.diet}
                    <input id="oe-diet" name="diet" maxLength={200} />
                  </label>
                </fieldset>
                {view.questions.map((q) => (
                  <QuestionField key={q.id} locale={locale} q={q} prefix="oe-q" />
                ))}
                {/* Left empty by people; robots fill it in. */}
                <label className="sr-only" aria-hidden="true">
                  Website
                  <input name="website" tabIndex={-1} autoComplete="off" />
                </label>
                <label className="check">
                  <input type="checkbox" name="consentData" required />
                  {t.consentData}
                </label>
                <label className="check">
                  <input type="checkbox" name="consentImage" />
                  {t.consentImage}
                </label>
                <p>
                  <button className="button" disabled={busy}>
                    {t.register}
                  </button>
                </p>
              </form>
            </Panel>
          )}
        </>
      )}
    </main>
  );
}

function Survey({ locale, questions, busy, send }: { locale: Locale; questions: Question[]; busy: boolean; send: (body: { rating: number; answers: Record<string, string | boolean> }) => void }) {
  const t = openEventsCopy[locale].public;
  return (
    <section aria-labelledby="open-event-survey">
      <h3 id="open-event-survey">{t.opinion}</h3>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          send({ rating: Number(d.get("rating")), answers: answersOf(d, questions) as Record<string, string | boolean> });
        }}
      >
        <fieldset>
          <legend>{t.rating}</legend>
          <div className="rating-row">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="check">
                <input type="radio" name="rating" value={n} required />
                {n}
              </label>
            ))}
          </div>
        </fieldset>
        {questions.map((q) => (
          <QuestionField key={q.id} locale={locale} q={{ ...q, required: false }} prefix="oe-s" />
        ))}
        <p>
          <button className="button" disabled={busy}>
            {openEventsCopy[locale].send}
          </button>
        </p>
      </form>
    </section>
  );
}
