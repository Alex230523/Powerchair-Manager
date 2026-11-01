"use client";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { classificationView } from "@/domains/classification/service";
import { classes, languages, type Decision } from "@/domains/classification/schema";
import { classificationCopy } from "./classification-copy";
import { ClassificationBadge, refreshClassificationTexts } from "./classification-badge";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { Badge, Card, EmptyState } from "./ui";

type View = Awaited<ReturnType<typeof classificationView>>;
type Session = View["sessions"][number];
type Line = Session["players"][number];
type Send = (body: Record<string, unknown>, done: string) => Promise<boolean>;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const dayOf = (locale: Locale, d: string) => new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "long", year: "numeric" }).format(new Date(d + "T12:00:00"));
const statusTone = { open: "info", published: "success", cancelled: "neutral" } as const;

/**
 * Wave 17 (J4): the classification days, on the federation's Licences page
 * (create, mark, decide, publish, the PF1/PF2 texts), in the referee's space
 * (the days naming them a classifier) and on the club's Licences page
 * (register the players, read the published results).
 */
export function ClassificationDays({ locale }: { locale: Locale }) {
  const t = classificationCopy[locale];
  const failure = useCallback((code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable, [t, locale]);
  const { data, error, setError, reload } = useData<View>("/api/classification", failure);
  const { busy, message, post } = usePost("/api/classification", reload, setError, failure);
  const send: Send = (body, done) => post({ ...body, organizationId: data?.organization_id }, done);
  if (!data) return error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>;
  if (data.mode === "none") return null;
  return (
    <Card title={t.title} subtitle={t.intro[data.mode]} labelledBy="classification-days" headingId="classification-days" className="classification-days">
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {data.can.manage && data.options && <NewDay locale={locale} options={data.options} today={data.today} busy={busy} send={send} />}
      {data.sessions.length ? (
        data.sessions.map((s) => <Day key={s.id} locale={locale} view={data} s={s} busy={busy} send={send} />)
      ) : (
        <EmptyState title={t.none} />
      )}
      {data.can.manage && <Texts locale={locale} texts={data.texts} busy={busy} send={send} />}
    </Card>
  );
}

function NewDay({ locale, options, today, busy, send }: { locale: Locale; options: NonNullable<View["options"]>; today: string; busy: boolean; send: Send }) {
  const t = classificationCopy[locale];
  return (
    <details className="classification-new">
      <summary>{t.newDay}</summary>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          void send(
            {
              action: "create",
              day: f.get("day"),
              registrationDeadline: f.get("deadline"),
              sharedVenueId: f.get("venueId") || null,
              venue: String(f.get("venue") ?? ""),
              notes: String(f.get("notes") ?? ""),
              clubIds: f.getAll("clubs"),
              classifierIds: f.getAll("classifiers"),
            },
            t.created,
          ).then((ok) => ok && form.reset());
        }}
      >
        <div className="form-grid">
          <label>
            {t.day}
            <input name="day" type="date" required min={today} />
          </label>
          <label>
            {t.deadline}
            <input name="deadline" type="date" required min={today} />
          </label>
          <label>
            {t.sharedVenue}
            <select name="venueId" defaultValue="">
              <option value="">{t.noSharedVenue}</option>
              {options.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.city ? `${v.name} · ${v.city}` : v.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.venue}
            <input name="venue" maxLength={200} aria-describedby="classification-venue-help" />
            <span className="field-help" id="classification-venue-help">
              {t.venueHelp}
            </span>
          </label>
        </div>
        <label>
          {t.notes}
          <textarea name="notes" maxLength={2000} rows={2} />
        </label>
        <fieldset className="check-list">
          <legend>{t.clubs}</legend>
          {options.clubs.map((c) => (
            <label key={c.id} className="check">
              <input type="checkbox" name="clubs" value={c.id} />
              {c.name}
            </label>
          ))}
        </fieldset>
        <fieldset className="check-list">
          <legend>{t.classifiers}</legend>
          {options.classifiers.length ? (
            options.classifiers.map((c) => (
              <label key={c.id} className="check">
                <input type="checkbox" name="classifiers" value={c.id} />
                {c.name}
              </label>
            ))
          ) : (
            <p className="muted">{t.noClassifier}</p>
          )}
        </fieldset>
        <p>
          <button className="button" disabled={busy}>
            {t.create}
          </button>
        </p>
      </form>
    </details>
  );
}

function Day({ locale, view, s, busy, send }: { locale: Locale; view: View; s: Session; busy: boolean; send: Send }) {
  const t = classificationCopy[locale];
  const [confirming, setConfirming] = useState(false);
  const label = fill(t.dayOf, { day: dayOf(locale, s.day) });
  const place = [s.venue_name && (s.venue_city ? `${s.venue_name} · ${s.venue_city}` : s.venue_name), s.venue].filter(Boolean).join(" · ");
  const marking = view.mode !== "club" && view.can.mark && s.status === "open";
  return (
    <section className="classification-day" aria-labelledby={`day-${s.id}`}>
      <h3 id={`day-${s.id}`}>
        {label} <Badge tone={statusTone[s.status]}>{t.status[s.status]}</Badge>
      </h3>
      <p className="muted">
        {place}
        {s.status === "open" && <> · {s.registrationOpen ? fill(t.until, { day: dayOf(locale, s.deadline) }) : t.registrationClosed}</>}
        {view.mode !== "club" && (
          <>
            <br />
            {t.clubs} : {s.clubs.map((c) => c.name).join(", ")}
            {s.classifiers.length > 0 && (
              <>
                {" "}
                · {t.classifiers} : {s.classifiers.map((c) => c.name).join(", ")}
              </>
            )}
          </>
        )}
      </p>
      {s.notes && <p>{s.notes}</p>}
      <p>{fill(t.registered, { n: s.players.length })}</p>

      {view.mode === "club" ? (
        <ClubLines locale={locale} view={view} s={s} busy={busy} send={send} />
      ) : s.players.length ? (
        <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">{t.cols.player}</th>
                <th scope="col">{t.cols.club}</th>
                <th scope="col">{t.cols.born}</th>
                <th scope="col">{t.cols.current}</th>
                {marking ? (
                  <>
                    <th scope="col">{t.cols.presence}</th>
                    <th scope="col">{t.cols.decision}</th>
                    <th scope="col">{t.cols.comment}</th>
                    <th scope="col">
                      <span className="sr-only">{t.save}</span>
                    </th>
                  </>
                ) : (
                  <th scope="col">{t.cols.result}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {s.players.map((l) => (marking ? <MarkRow key={l.id} locale={locale} l={l} busy={busy} send={send} /> : <ResultRow key={l.id} locale={locale} l={l} club />))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={t.nobodyRegistered} />
      )}

      {view.can.manage && s.status === "open" && (
        <div className="classification-actions">
          <p className="muted" role="status">
            {s.progress.ok ? t.ready : fill(t.progress, { unmarked: s.progress.unmarked, undecided: s.progress.undecided })}
          </p>
          <p className="field-help">{t.publishHint}</p>
          <p className="actions">
            <button type="button" className="button" disabled={busy || !s.progress.ok} onClick={() => void send({ action: "publish", id: s.id }, t.published)}>
              {t.publish}
              <span className="sr-only"> : {label}</span>
            </button>
            {confirming ? (
              <>
                <span>{fill(t.confirmCancel, { day: dayOf(locale, s.day) })}</span>
                <button type="button" className="button danger" disabled={busy} onClick={() => void send({ action: "cancel", id: s.id }, t.cancelled)}>
                  {t.cancelDay}
                </button>
                <button type="button" className="button secondary" onClick={() => setConfirming(false)}>
                  {t.back}
                </button>
              </>
            ) : (
              <button type="button" className="button secondary" onClick={() => setConfirming(true)}>
                {t.cancelDay}
                <span className="sr-only"> : {label}</span>
              </button>
            )}
          </p>
        </div>
      )}
    </section>
  );
}

function ResultRow({ locale, l, club }: { locale: Locale; l: Line; club?: boolean }) {
  const t = classificationCopy[locale];
  return (
    <tr>
      <th scope="row">{l.full_name}</th>
      {club && <td>{l.club}</td>}
      <td>{l.birth_year ?? ""}</td>
      <td>
        <ClassificationBadge locale={locale} value={l.classification} />
      </td>
      <td>
        {l.status !== "published" ? (
          <span className="muted">{t.awaiting}</span>
        ) : l.present === false ? (
          t.absent
        ) : l.decision ? (
          <Badge tone={l.decision === "review" ? "warning" : "success"}>{t.decisions[l.decision]}</Badge>
        ) : (
          ""
        )}
        {l.status === "published" && l.comment && <span className="muted"> · {l.comment}</span>}
      </td>
    </tr>
  );
}

function MarkRow({ locale, l, busy, send }: { locale: Locale; l: Line; busy: boolean; send: Send }) {
  const t = classificationCopy[locale];
  const [present, setPresent] = useState(l.present === null ? "" : l.present ? "yes" : "no"),
    [decision, setDecision] = useState<Decision | "">(l.decision ?? ""),
    [comment, setComment] = useState(l.comment);
  const id = `mark-${l.id}`;
  return (
    <tr>
      <th scope="row">{l.full_name}</th>
      <td>{l.club}</td>
      <td>{l.birth_year ?? ""}</td>
      <td>
        <ClassificationBadge locale={locale} value={l.classification} />
      </td>
      <td>
        <label className="sr-only" htmlFor={`${id}-presence`}>
          {t.cols.presence} : {l.full_name}
        </label>
        <select id={`${id}-presence`} value={present} onChange={(e) => setPresent(e.target.value)}>
          <option value="">{t.presence.unmarked}</option>
          <option value="yes">{t.presence.present}</option>
          <option value="no">{t.presence.absent}</option>
        </select>
      </td>
      <td>
        <label className="sr-only" htmlFor={`${id}-decision`}>
          {t.cols.decision} : {l.full_name}
        </label>
        <select id={`${id}-decision`} value={present === "yes" ? decision : ""} disabled={present !== "yes"} onChange={(e) => setDecision(e.target.value as Decision | "")}>
          <option value="">{t.noDecision}</option>
          {(["PF1", "PF2", "review"] as const).map((d) => (
            <option key={d} value={d}>
              {t.decisions[d]}
            </option>
          ))}
        </select>
      </td>
      <td>
        <label className="sr-only" htmlFor={`${id}-comment`}>
          {t.cols.comment} : {l.full_name}
        </label>
        <input id={`${id}-comment`} value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} />
      </td>
      <td>
        <button
          type="button"
          className="button secondary sm"
          disabled={busy}
          onClick={() =>
            void send(
              { action: "mark", id: l.id, present: present === "" ? null : present === "yes", decision: present === "yes" && decision ? decision : null, comment },
              t.saved,
            )
          }
        >
          {t.save}
          <span className="sr-only"> : {l.full_name}</span>
        </button>
      </td>
    </tr>
  );
}

function ClubLines({ locale, view, s, busy, send }: { locale: Locale; view: View; s: Session; busy: boolean; send: Send }) {
  const t = classificationCopy[locale];
  const [chosen, setChosen] = useState<string[]>([]);
  const registered = new Set(s.players.map((l) => l.profile_id));
  const free = view.eligible.filter((p) => !registered.has(p.id));
  const editable = view.can.register && s.registrationOpen;
  return (
    <>
      {s.players.length ? (
        <div className="table-scroll" role="region" aria-label={t.cols.player} tabIndex={0}>
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">{t.cols.player}</th>
                <th scope="col">{t.cols.born}</th>
                <th scope="col">{t.cols.current}</th>
                <th scope="col">{t.cols.result}</th>
                {editable && (
                  <th scope="col">
                    <span className="sr-only">{t.unregister}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {s.players.map((l) => (
                <tr key={l.id}>
                  <th scope="row">{l.full_name}</th>
                  <td>{l.birth_year ?? ""}</td>
                  <td>
                    <ClassificationBadge locale={locale} value={l.classification} />
                  </td>
                  <td>
                    {l.status !== "published" ? (
                      <span className="muted">{t.awaiting}</span>
                    ) : l.present === false ? (
                      t.absent
                    ) : l.decision ? (
                      <Badge tone={l.decision === "review" ? "warning" : "success"}>{t.decisions[l.decision]}</Badge>
                    ) : null}
                    {l.status === "published" && l.comment && <span className="muted"> · {l.comment}</span>}
                  </td>
                  {editable && (
                    <td>
                      {l.status === "registered" && (
                        <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "unregister", sessionId: s.id, profileId: l.profile_id }, t.saved)}>
                          {t.unregister}
                          <span className="sr-only"> : {l.full_name}</span>
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={t.nobodyRegistered} />
      )}
      {editable && (
        <fieldset className="check-list">
          <legend>{t.choose}</legend>
          {free.length ? (
            free.map((p) => (
              <label key={p.id} className="check">
                <input type="checkbox" checked={chosen.includes(p.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, p.id] : chosen.filter((x) => x !== p.id))} />
                <span>
                  {p.full_name} <span className="muted">· {t.classes[p.classification]}</span>
                </span>
              </label>
            ))
          ) : (
            <p className="muted">{t.allRegistered}</p>
          )}
          {free.length > 0 && (
            <p>
              <button
                type="button"
                className="button"
                disabled={busy || !chosen.length}
                onClick={() => void send({ action: "register", sessionId: s.id, profileIds: chosen }, t.registeredDone).then((ok) => ok && setChosen([]))}
              >
                {fill(t.register, { n: chosen.length })}
              </button>
            </p>
          )}
        </fieldset>
      )}
    </>
  );
}

function Texts({ locale, texts, busy, send }: { locale: Locale; texts: View["texts"]; busy: boolean; send: Send }) {
  const t = classificationCopy[locale];
  return (
    <details className="classification-texts">
      <summary>{t.texts}</summary>
      <p className="muted">{t.textsIntro}</p>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const value = Object.fromEntries(classes.map((c) => [c, Object.fromEntries(languages.map((l) => [l, String(f.get(`${c}-${l}`) ?? "")]))]));
          void send({ action: "texts", texts: value }, t.saved).then((ok) => ok && refreshClassificationTexts());
        }}
      >
        <div className="form-grid">
          {classes.map((c) =>
            languages.map((l) => (
              <label key={`${c}-${l}`}>
                {fill(t.textLabel, { class: c, language: t.languages[l] })}
                <textarea name={`${c}-${l}`} required maxLength={500} rows={3} defaultValue={texts[c][l]} />
              </label>
            )),
          )}
        </div>
        <p>
          <button className="button" disabled={busy}>
            {t.saveTexts}
          </button>
        </p>
      </form>
    </details>
  );
}
