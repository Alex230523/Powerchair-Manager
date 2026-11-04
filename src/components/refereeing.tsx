"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { refereeingView, reportForClub } from "@/domains/referees/service";
import { expenseAmount, warnings } from "@/domains/referees/schema";
import { flushReports, pendingReports, queueReport } from "@/lib/offline-queue";
import { errors } from "./access-copy";
import { fill, refereeingCopy } from "./refereeing-copy";
import { useData, usePost } from "./use-api";
import { Badge, Card, EmptyState } from "./ui";

/**
 * 25 and 36 to 39: the refereeing circuit. The referee's desk (answers,
 * routes, report even offline, claims, trainings), the federation's desk
 * (cover the matches with the warnings, a whole day at once, levels and
 * rates, trainings and claims to decide) and, on the club side, the review
 * of the report within 48 hours.
 */
type View = Awaited<ReturnType<typeof refereeingView>>;
type Mine = NonNullable<View["mine"]>;
type Act = (body: Record<string, unknown>, done: string) => Promise<boolean>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const when = (l: Locale, d: string) =>
  new Intl.DateTimeFormat(tag(l), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(d));
const money = (l: Locale, cents: number) => new Intl.NumberFormat(tag(l), { style: "currency", currency: "EUR" }).format(cents / 100);
const tone = (s: string) => (s === "accepted" || s === "approved" || s === "paid" ? "success" : s === "declined" || s === "refused" ? "danger" : "warning");

function useRefereeing(locale: Locale) {
  const t = refereeingCopy[locale];
  const failure = useCallback((code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable, [t, locale]);
  const { data, error, setError, denied, reload } = useData<View>("/api/refereeing", failure);
  const { busy, message, post } = usePost("/api/refereeing", reload, setError, failure);
  const act: Act = (body, done) => post({ ...body, organizationId: data?.organization_id }, done);
  return { t, data, error, denied, busy, message, act, reload };
}

async function fileData(file: File | undefined | null) {
  if (!file || !file.size) return null;
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("INVALID_FILE"));
    r.readAsDataURL(file);
  });
  return { filename: file.name, mediaType: file.type, data };
}

/** The referee's desk, above the availability of his space. */
export function RefereeDesk({ locale }: { locale: Locale }) {
  const { t, data, error, busy, message, act, reload } = useRefereeing(locale);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">{t.loading}</p>;
  const mine = data.mine;
  if (!mine) return null;
  const answer = (d: { kind: string; id: string }, accept: boolean) => void act({ action: "answer", target: { kind: d.kind, id: d.id }, accept }, t.saved);
  return (
    <section className="refereeing" aria-label={t.proposals}>
      {message && <p role="status">{message}</p>}
      <p className="muted">
        {fill(t.level, { level: mine.levelName })} ·{" "}
        <a href={`/api/refereeing?summary=${encodeURIComponent(data.me)}&year=${data.year}`} download>
          {fill(t.summary, { year: data.year })}
        </a>
      </p>
      {mine.availabilityMissing > 0 && (
        <p className="notice">
          {fill(t.availabilityMissing, { n: mine.availabilityMissing })} <a href="#ref-availability">{t.availabilityLink}</a>
        </p>
      )}
      <div className="grid">
        <Card title={t.proposals} labelledBy="ref-proposals" headingId="ref-proposals">
          {mine.proposals.length ? (
            <ul className="records">
              {mine.proposals.map((d) => (
                <li key={d.kind + d.id}>
                  <strong>{d.label}</strong>
                  <span className="muted">
                    {" "}
                    · {when(locale, d.starts_at)}
                    {d.venue ? ` · ${d.venue}` : ""} · {t.roles[d.role]}
                  </span>
                  <div className="row-actions">
                    <button type="button" className="button" disabled={busy} onClick={() => answer(d, true)}>
                      {t.accept}
                      <span className="sr-only"> : {d.label}</span>
                    </button>
                    <button type="button" className="button secondary" disabled={busy} onClick={() => answer(d, false)}>
                      {t.decline}
                      <span className="sr-only"> : {d.label}</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t.noProposal} />
          )}
        </Card>
        <Card title={t.upcoming} labelledBy="ref-upcoming" headingId="ref-upcoming">
          <p className="muted">
            {t.calendarHint} <Link href={`/${locale}/calendar`}>{t.calendarLink}</Link>
          </p>
          {mine.upcoming.length ? (
            <ul className="records">
              {mine.upcoming.map((d) => (
                <li key={d.kind + d.id}>
                  <strong>{d.label}</strong>
                  <span className="muted">
                    {" "}
                    · {when(locale, d.starts_at)}
                    {d.venue ? ` · ${d.venue}` : ""} · {t.roles[d.role]}
                  </span>
                  {d.route && (
                    <div className="row-actions">
                      <a className="button secondary" href={d.route.google} target="_blank" rel="noreferrer">
                        {t.googleMaps}
                        <span className="sr-only"> : {d.venue}</span>
                      </a>
                      <a className="button secondary" href={d.route.waze} target="_blank" rel="noreferrer">
                        {t.waze}
                        <span className="sr-only"> : {d.venue}</span>
                      </a>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t.noUpcoming} />
          )}
        </Card>
        <Reports locale={locale} mine={mine} organizationId={data.organization_id} reload={reload} />
        <Claims locale={locale} mine={mine} settings={data.settings} busy={busy} act={act} />
        <Trainings locale={locale} mine={mine} busy={busy} act={act} />
      </div>
    </section>
  );
}

/** 4: the reports to send; without network they wait on the phone and leave when it comes back. */
function Reports({ locale, mine, organizationId, reload }: { locale: Locale; mine: Mine; organizationId: string; reload: () => Promise<void> }) {
  const t = refereeingCopy[locale];
  const [waiting, setWaiting] = useState(0),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const failure = (code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable;
  const send = (body: Record<string, unknown>) => fetch("/api/refereeing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  useEffect(() => {
    let live = true;
    const flush = async () => {
      if (!pendingReports().length) return;
      const r = await flushReports(send);
      if (!live) return;
      setWaiting(r.left);
      if (r.sent) {
        setNote(fill(t.reportsFlushed, { n: r.sent }));
        await reload();
      }
    };
    const count = () => {
      if (live) setWaiting(pendingReports().length);
    };
    void Promise.resolve().then(count).then(flush);
    window.addEventListener("online", flush);
    return () => {
      live = false;
      window.removeEventListener("online", flush);
    };
  }, [t, reload]);
  async function submit(body: Record<string, unknown>) {
    const full = { ...body, organizationId };
    setBusy(true);
    setError("");
    setNote("");
    try {
      const r = await send(full);
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await reload();
      setNote(t.reportSent);
    } catch (e) {
      // No network: the report waits on this device.
      if (e instanceof TypeError) {
        setWaiting(queueReport(String(body.matchId), full));
        setNote(t.reportQueued);
      } else setError(failure(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={t.toReport} labelledBy="ref-reports" headingId="ref-reports">
      {error && <p role="alert">{error}</p>}
      {note && <p role="status">{note}</p>}
      {waiting > 0 && <p className="notice">{fill(t.reportsWaiting, { n: waiting })}</p>}
      {mine.toReport.length ? (
        <ul className="records">
          {mine.toReport.map((d) => (
            <li key={d.id}>
              <ReportForm locale={locale} match={d} busy={busy} submit={submit} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t.noReport} />
      )}
    </Card>
  );
}

type Ev = { kind: string; side: string; player: string; profileId: string | null; minute: number | null };
function ReportForm({ locale, match, busy, submit }: { locale: Locale; match: Mine["toReport"][number]; busy: boolean; submit: (b: Record<string, unknown>) => Promise<void> }) {
  const t = refereeingCopy[locale];
  const [events, setEvents] = useState<Ev[]>([]),
    [who, setWho] = useState("");
  const id = (k: string) => `rep-${k}-${match.id}`;
  const nameOf = (e: Ev) => (e.profileId ? (match.lineup.find((p) => p.id === e.profileId)?.name ?? "") : e.player);
  return (
    <form
      className="finance-form"
      aria-label={`${t.sendReport} : ${match.label}`}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void submit({
          action: "report",
          matchId: match.id,
          homeScore: Number(f.get("home")),
          awayScore: Number(f.get("away")),
          events,
          incidents: String(f.get("incidents") ?? ""),
          reserves: String(f.get("reserves") ?? ""),
        });
      }}
    >
      <p>
        <strong>{match.label}</strong> <span className="muted">· {when(locale, match.starts_at)}</span>
      </p>
      <div className="form-pair">
        <label htmlFor={id("home")}>
          {t.homeScore}
          <input id={id("home")} name="home" type="number" inputMode="numeric" min={0} max={99} required />
        </label>
        <label htmlFor={id("away")}>
          {t.awayScore}
          <input id={id("away")} name="away" type="number" inputMode="numeric" min={0} max={99} required />
        </label>
      </div>
      <fieldset>
        <legend>{t.events}</legend>
        {events.length ? (
          <ul className="records">
            {events.map((e, i) => (
              <li key={i}>
                {t.kinds[e.kind]} · {e.side === "home" ? t.home : t.away} · {nameOf(e)}
                {e.minute !== null ? ` · ${e.minute}'` : ""}{" "}
                <button type="button" className="text-button" onClick={() => setEvents(events.filter((_, j) => j !== i))}>
                  {t.removeEvent}
                  <span className="sr-only"> : {t.kinds[e.kind]} {nameOf(e)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.noEvent}</p>
        )}
        <div className="form-pair">
          <label htmlFor={id("kind")}>
            {t.eventKind}
            <select id={id("kind")} defaultValue="goal">
              {Object.entries(t.kinds).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={id("side")}>
            {t.side}
            <select id={id("side")} defaultValue="home">
              <option value="home">{t.home}</option>
              <option value="away">{t.away}</option>
            </select>
          </label>
        </div>
        <div className="form-pair">
          <label htmlFor={id("who")}>
            {t.fromLineup}
            <select id={id("who")} value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">{t.outside}</option>
              {match.lineup.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number !== null ? `${p.number} · ` : ""}
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={id("other")}>
            {t.otherPlayer}
            <input id={id("other")} maxLength={120} disabled={!!who} />
          </label>
        </div>
        <label htmlFor={id("minute")}>
          {t.minute}
          <input id={id("minute")} type="number" inputMode="numeric" min={0} max={130} />
        </label>
        <button
          type="button"
          className="button secondary"
          onClick={(e) => {
            const form = e.currentTarget.form!;
            const v = (k: string) => (form.querySelector(`#${CSS.escape(id(k))}`) as HTMLInputElement | HTMLSelectElement).value;
            const minute = v("minute");
            setEvents([...events, { kind: v("kind"), side: v("side"), profileId: who || null, player: who ? "" : v("other").trim(), minute: minute === "" ? null : Number(minute) }]);
          }}
        >
          {t.addEvent}
        </button>
      </fieldset>
      <label htmlFor={id("incidents")}>
        {t.incidents}
        <textarea id={id("incidents")} name="incidents" maxLength={4000} />
      </label>
      <label htmlFor={id("reserves")}>
        {t.reserves}
        <textarea id={id("reserves")} name="reserves" maxLength={2000} />
      </label>
      <button className="button" disabled={busy}>
        {t.sendReport}
      </button>
    </form>
  );
}

/** 37: the claims: the amount follows the federation's rates. */
function Claims({ locale, mine, settings, busy, act }: { locale: Locale; mine: Mine; settings: View["settings"]; busy: boolean; act: Act }) {
  const t = refereeingCopy[locale];
  return (
    <Card title={t.toClaim} labelledBy="ref-claims" headingId="ref-claims">
      <p className="muted">{fill(t.rates, { flat: money(locale, settings.referee_flat_cents), rate: money(locale, settings.referee_km_rate_cents) })}</p>
      {mine.toClaim.length ? (
        <ul className="records">
          {mine.toClaim.map((d) => (
            <li key={d.kind + d.id}>
              <ClaimForm locale={locale} match={d} settings={settings} busy={busy} act={act} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t.noClaim} />
      )}
      <h3>{t.myClaims}</h3>
      {mine.expenses.length ? (
        <ul className="records">
          {mine.expenses.map((e) => (
            <li key={e.id}>
              {money(locale, e.amount_cents)} · {e.km} km <Badge tone={tone(e.status)}>{t.expenseStatus[e.status]}</Badge>
              {e.reason ? <span className="muted"> · {e.reason}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t.noMyClaim}</p>
      )}
    </Card>
  );
}
function ClaimForm({ locale, match, settings, busy, act }: { locale: Locale; match: Mine["toClaim"][number]; settings: View["settings"]; busy: boolean; act: Act }) {
  const t = refereeingCopy[locale];
  const [km, setKm] = useState(0),
    [extra, setExtra] = useState(0);
  const id = (k: string) => `claim-${k}-${match.id}`;
  return (
    <form
      className="finance-form"
      aria-label={`${t.claim} : ${match.label}`}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await act(
          { action: "expense", target: { kind: match.kind, id: match.id }, km, extraCents: Math.round(extra * 100), note: String(f.get("note") ?? ""), proof: await fileData(f.get("proof") as File | null) },
          t.claimSent,
        );
      }}
    >
      <p>
        <strong>{match.label}</strong> <span className="muted">· {when(locale, match.starts_at)}</span>
      </p>
      <div className="form-pair">
        <label htmlFor={id("km")}>
          {t.km}
          <input id={id("km")} type="number" inputMode="decimal" min={0} max={5000} step="0.1" required value={km} onChange={(e) => setKm(Number(e.target.value))} />
        </label>
        <label htmlFor={id("extra")}>
          {t.extra}
          <input id={id("extra")} type="number" inputMode="decimal" min={0} max={1000} step="0.01" value={extra} onChange={(e) => setExtra(Number(e.target.value))} />
        </label>
      </div>
      <label htmlFor={id("note")}>
        {t.note}
        <input id={id("note")} name="note" maxLength={500} />
      </label>
      <label htmlFor={id("proof")}>
        {t.proof}
        <input id={id("proof")} name="proof" type="file" accept="application/pdf,image/png,image/jpeg" />
      </label>
      <p role="status">{fill(t.amount, { amount: money(locale, expenseAmount(settings.referee_flat_cents, settings.referee_km_rate_cents, km, Math.round(extra * 100))) })}</p>
      <button className="button" disabled={busy}>
        {t.claim}
      </button>
    </form>
  );
}

/** 38: the trainings, validated by the federation. */
function Trainings({ locale, mine, busy, act }: { locale: Locale; mine: Mine; busy: boolean; act: Act }) {
  const t = refereeingCopy[locale];
  return (
    <Card title={t.trainings} labelledBy="ref-trainings" headingId="ref-trainings">
      {mine.trainings.length ? (
        <ul className="records">
          {mine.trainings.map((x) => (
            <li key={x.id}>
              {x.title} · {x.done_on} <Badge tone={tone(x.status)}>{t.trainingStatus[x.status]}</Badge>
              {x.note ? <span className="muted"> · {x.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t.noTraining}</p>
      )}
      <form
        className="finance-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          if (await act({ action: "training", title: String(f.get("title")), doneOn: String(f.get("doneOn")), proof: await fileData(f.get("proof") as File | null) }, t.trainingSent)) form.reset();
        }}
      >
        <label htmlFor="training-title">
          {t.trainingTitle}
          <input id="training-title" name="title" required minLength={2} maxLength={160} />
        </label>
        <label htmlFor="training-date">
          {t.trainingDate}
          <input id="training-date" name="doneOn" type="date" required />
        </label>
        <label htmlFor="training-proof">
          {t.proof}
          <input id="training-proof" name="proof" type="file" accept="application/pdf,image/png,image/jpeg" />
        </label>
        <button className="button" disabled={busy}>
          {t.addTraining}
        </button>
      </form>
    </Card>
  );
}

/** The federation's desk (refereeing competence). */
export function FederationRefereeing({ locale }: { locale: Locale }) {
  const { t, data, error, denied, busy, message, act } = useRefereeing(locale);
  const [minLevel, setMinLevel] = useState(0);
  if (denied) return null;
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">{t.loading}</p>;
  if (!data.can.manage) return null;
  // Tournament matches of a same day are designated together.
  // 6: the level filters the referees offered (a cup final wants a national referee).
  const eligible = data.referees.filter((r) => r.level >= minLevel);
  const days = new Map<string, View["matches"]>();
  for (const m of data.matches) if (m.day_id) days.set(m.day_id, [...(days.get(m.day_id) ?? []), m]);
  return (
    <section className="refereeing" aria-labelledby="fed-ref-title">
      <h2 id="fed-ref-title">{t.deskTitle}</h2>
      <p className="muted">{t.deskIntro}</p>
      {message && <p role="status">{message}</p>}
      {!data.referees.length && <p className="notice">{t.noReferee}</p>}
      <label htmlFor="ref-min-level">
        {t.minLevel}
        <select id="ref-min-level" value={minLevel} onChange={(e) => setMinLevel(Number(e.target.value))}>
          {data.settings.referee_levels.map((l, i) => (
            <option key={l + i} value={i}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {data.matches.length ? (
        <ul className="records">
          {data.matches.map((m) => (
            <li key={m.kind + m.id}>
              <MatchCover locale={locale} match={m} referees={eligible} busy={busy} act={act} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t.noMatch} />
      )}
      {[...days.entries()].map(([dayId, list]) => (
        <DayForm key={dayId} locale={locale} dayId={dayId} matches={list} referees={eligible} busy={busy} act={act} />
      ))}
      <div className="grid">
        <Card title={t.referees} labelledBy="fed-ref-levels" headingId="fed-ref-levels">
          {data.referees.length ? (
            <ul className="records">
              {data.referees.map((r) => (
                <li key={r.id}>
                  <form
                    className="inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act({ action: "level", userId: r.id, level: Number(new FormData(e.currentTarget).get("level")) }, t.saved);
                    }}
                  >
                    <strong>{r.name}</strong> <span className="muted">· {fill(t.seasonLoad, { n: r.season })}</span>
                    <label>
                      <span className="sr-only">{fill(t.levelOf, { name: r.name })}</span>
                      <select name="level" defaultValue={r.level}>
                        {data.settings.referee_levels.map((l, i) => (
                          <option key={l + i} value={i}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="button secondary" disabled={busy}>
                      {t.saveLevel}
                      <span className="sr-only"> : {r.name}</span>
                    </button>
                    <a href={`/api/refereeing?summary=${encodeURIComponent(r.id)}&year=${data.year}`} download>
                      {fill(t.summary, { year: data.year })}
                      <span className="sr-only"> : {r.name}</span>
                    </a>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t.noReferee} />
          )}
        </Card>
        <Card title={t.settings} labelledBy="fed-ref-settings" headingId="fed-ref-settings">
          <form
            className="finance-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(
                {
                  action: "settings",
                  levels: String(f.get("levels"))
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  flatCents: Math.round(Number(f.get("flat")) * 100),
                  kmRateCents: Math.round(Number(f.get("rate")) * 100),
                },
                t.saved,
              );
            }}
          >
            <label htmlFor="ref-levels">
              {t.levelsField}
              <textarea id="ref-levels" name="levels" required defaultValue={data.settings.referee_levels.join("\n")} />
            </label>
            <div className="form-pair">
              <label htmlFor="ref-flat">
                {t.flat}
                <input id="ref-flat" name="flat" type="number" inputMode="decimal" min={0} max={1000} step="0.01" defaultValue={data.settings.referee_flat_cents / 100} />
              </label>
              <label htmlFor="ref-rate">
                {t.kmRate}
                <input id="ref-rate" name="rate" type="number" inputMode="decimal" min={0} max={5} step="0.01" defaultValue={data.settings.referee_km_rate_cents / 100} />
              </label>
            </div>
            <button className="button" disabled={busy}>
              {t.saveSettings}
            </button>
          </form>
        </Card>
        <Card title={t.trainingsToDecide} labelledBy="fed-ref-trainings" headingId="fed-ref-trainings">
          {data.trainings.length ? (
            <ul className="records">
              {data.trainings.map((x) => (
                <li key={x.id}>
                  <Decide locale={locale} id={x.id} label={`${x.name} · ${x.title} · ${x.done_on}`} proof={x.proof_filename ? `/api/refereeing?proof=training:${x.id}` : null} kind="training" busy={busy} act={act} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t.noTrainingToDecide} />
          )}
        </Card>
        <Expenses locale={locale} expenses={data.expenses} busy={busy} act={act} />
      </div>
    </section>
  );
}

function MatchCover({ locale, match, referees, busy, act }: { locale: Locale; match: View["matches"][number]; referees: View["referees"]; busy: boolean; act: Act }) {
  const t = refereeingCopy[locale];
  const [pick, setPick] = useState("");
  const startsAt = new Date(match.starts_at).toISOString();
  const warn = (r: View["referees"][number]) => warnings({ day: match.day, startsAt, clubs: match.clubs }, r);
  const chosen = referees.find((r) => r.id === pick);
  const flagged = chosen ? warn(chosen) : [];
  const assigned = match.designations;
  const id = `cover-${match.kind}-${match.id}`;
  return (
    <>
      <strong>{match.label}</strong>
      <span className="muted">
        {" "}
        · {when(locale, match.starts_at)}
        {match.venue ? ` · ${match.venue}` : ""}
      </span>
      {!assigned.some((a) => a.status !== "declined") && <Badge tone="warning">{t.uncovered}</Badge>}
      {assigned.length > 0 && (
        <ul className="assigned-referees">
          {assigned.map((a) => (
            <li key={a.referee_id}>
              {a.name} · {t.roles[a.role]} <Badge tone={tone(a.status)}>{t.statuses[a.status]}</Badge>
              <button type="button" className="text-button" disabled={busy} onClick={() => void act({ action: "withdraw", target: { kind: match.kind, id: match.id }, refereeId: a.referee_id }, t.saved)}>
                {t.withdraw}
                <span className="sr-only"> : {a.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {referees.length > 0 && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act({ action: "designate", target: { kind: match.kind, id: match.id }, refereeId: pick, role: f.get("role") }, t.saved);
          }}
        >
          <label htmlFor={id}>
            <span className="sr-only">
              {t.referee} : {match.label}
            </span>
            <select id={id} required value={pick} onChange={(e) => setPick(e.target.value)} aria-describedby={flagged.length ? id + "-warn" : undefined}>
              <option value="" disabled>
                {t.referee}
              </option>
              {referees.map((r) => {
                const w = warn(r);
                return (
                  <option key={r.id} value={r.id}>
                    {r.name} ·                     {fill(t.seasonLoad, { n: r.season })}
                    {w.length ? ` · ⚠ ${w.map((k) => t.warnings[k]).join(", ")}` : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            <span className="sr-only">{t.role}</span>
            <select name="role" defaultValue="main">
              {Object.entries(t.roles).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button className="button secondary" disabled={busy || !pick}>
            {t.designate}
          </button>
          {chosen && flagged.length > 0 && (
            <p id={id + "-warn"} className="notice">
              {fill(t.warningFor, { name: chosen.name, list: flagged.map((k) => t.warnings[k]).join(", ") })}
            </p>
          )}
        </form>
      )}
    </>
  );
}

/** 2: a whole tournament day at once. */
function DayForm({ locale, dayId, matches, referees, busy, act }: { locale: Locale; dayId: string; matches: View["matches"]; referees: View["referees"]; busy: boolean; act: Act }) {
  const t = refereeingCopy[locale];
  return (
    <details className="report-details">
      <summary>
        {t.dayForm} · {matches[0].day} · {matches[0].venue}
      </summary>
      <p className="muted">{t.dayHint}</p>
      <form
        className="finance-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const assignments = matches.map((m) => ({ matchId: m.id, refereeId: String(f.get(m.id) ?? ""), role: "main" })).filter((a) => a.refereeId);
          if (assignments.length) void act({ action: "designateDay", dayId, assignments }, fill(t.daySaved, { n: assignments.length }));
        }}
      >
        {matches.map((m) => (
          <label key={m.id} htmlFor={`day-${m.id}`}>
            {when(locale, m.starts_at)} · {m.label}
            <select id={`day-${m.id}`} name={m.id} defaultValue="">
              <option value="">{t.nobody}</option>
              {referees.map((r) => {
                const w = warnings({ day: m.day, startsAt: new Date(m.starts_at).toISOString(), clubs: m.clubs }, r);
                return (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {w.length ? ` · ⚠ ${w.map((k) => t.warnings[k]).join(", ")}` : ""}
                  </option>
                );
              })}
            </select>
          </label>
        ))}
        <button className="button" disabled={busy}>
          {t.saveDay}
        </button>
      </form>
    </details>
  );
}

function Decide({ locale, id, label, proof, kind, busy, act }: { locale: Locale; id: string; label: string; proof: string | null; kind: "training" | "expense"; busy: boolean; act: Act }) {
  const t = refereeingCopy[locale];
  const [reason, setReason] = useState("");
  const decide = (approve: boolean) =>
    void act(kind === "training" ? { action: "decideTraining", id, approve, note: reason } : { action: "decideExpense", id, approve, reason }, t.saved);
  return (
    <>
      <span>{label}</span>
      {proof && (
        <>
          {" "}
          · <a href={proof}>{t.proofLink}</a>
        </>
      )}
      <label htmlFor={`reason-${id}`}>
        {t.reason}
        <input id={`reason-${id}`} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="row-actions">
        <button type="button" className="button" disabled={busy} onClick={() => decide(true)}>
          {t.approve}
          <span className="sr-only"> : {label}</span>
        </button>
        <button type="button" className="button secondary" disabled={busy || !reason.trim()} onClick={() => decide(false)}>
          {t.refuse}
          <span className="sr-only"> : {label}</span>
        </button>
      </div>
    </>
  );
}

function Expenses({ locale, expenses, busy, act }: { locale: Locale; expenses: View["expenses"]; busy: boolean; act: Act }) {
  const t = refereeingCopy[locale];
  const submitted = expenses.filter((e) => e.status === "submitted");
  const approved = expenses.filter((e) => e.status === "approved");
  return (
    <Card title={t.expensesToDecide} labelledBy="fed-ref-expenses" headingId="fed-ref-expenses">
      {!expenses.length && <EmptyState title={t.noExpense} />}
      {submitted.length > 0 && (
        <ul className="records">
          {submitted.map((e) => (
            <li key={e.id}>
              <Decide
                locale={locale}
                id={e.id}
                label={`${e.name} · ${e.km} km · ${money(locale, e.amount_cents)}${e.note ? ` · ${e.note}` : ""}`}
                proof={e.proof_filename ? `/api/refereeing?proof=expense:${e.id}` : null}
                kind="expense"
                busy={busy}
                act={act}
              />
            </li>
          ))}
        </ul>
      )}
      {approved.length > 0 && (
        <form
          className="finance-form"
          onSubmit={(ev: FormEvent<HTMLFormElement>) => {
            ev.preventDefault();
            const ids = new FormData(ev.currentTarget).getAll("paid").map(String);
            if (ids.length) void act({ action: "paid", ids }, t.saved);
          }}
        >
          <fieldset>
            <legend>{t.toPay}</legend>
            {approved.map((e) => (
              <label key={e.id} className="check">
                <input type="checkbox" name="paid" value={e.id} />
                {e.name} · {money(locale, e.amount_cents)}
              </label>
            ))}
          </fieldset>
          <div className="row-actions">
            <button className="button" disabled={busy}>
              {t.markPaid}
            </button>
            <a className="button secondary" href="/api/refereeing?expenses=csv" download>
              {t.csv}
            </a>
          </div>
        </form>
      )}
    </Card>
  );
}

/** 4: on the club side, the referee's report and its review within 48 hours. */
export function ReportReview({ locale, matchId }: { locale: Locale; matchId: string }) {
  const t = refereeingCopy[locale];
  const failure = useCallback((code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable, [t, locale]);
  const { data, error, setError, reload } = useData<Awaited<ReturnType<typeof reportForClub>>>(`/api/refereeing?report=${matchId}`, failure);
  const { busy, message, post } = usePost("/api/refereeing", reload, setError, failure);
  const [comment, setComment] = useState("");
  if (error) return <p role="alert">{error}</p>;
  if (!data) return null;
  const r = data.report as {
    home_score: number;
    away_score: number;
    events: { kind: string; side: string; player: string; minute: number | null }[];
    incidents: string;
    reserves: string;
    referee: string;
    validated_at: string | null;
    decision: string | null;
    comment: string | null;
  } | null;
  return (
    <section className="report-review" aria-labelledby={`review-${matchId}`}>
      <h3 id={`review-${matchId}`}>{t.reportTitle}</h3>
      {message && <p role="status">{message}</p>}
      {!r ? (
        <p className="muted">{t.noReportYet}</p>
      ) : (
        <>
          <p>
            <strong>
              {r.home_score} - {r.away_score}
            </strong>{" "}
            <span className="muted">· {fill(t.by, { name: r.referee })}</span>
          </p>
          {r.events.length > 0 && (
            <ul className="records">
              {r.events.map((e, i) => (
                <li key={i}>
                  {t.kinds[e.kind]} · {e.side === "home" ? t.home : t.away} · {e.player}
                  {e.minute !== null ? ` · ${e.minute}'` : ""}
                </li>
              ))}
            </ul>
          )}
          {r.incidents && (
            <p>
              <strong>{t.incidents} :</strong> {r.incidents}
            </p>
          )}
          {r.reserves && (
            <p>
              <strong>{t.reserves} :</strong> {r.reserves}
            </p>
          )}
          {r.validated_at ? (
            <Badge tone="success">{t.validated}</Badge>
          ) : r.decision === "contested" ? (
            <Badge tone="warning">{t.contested}</Badge>
          ) : null}
          {!r.validated_at && data.can.review && (data.open ? (
            <div className="finance-form">
              <p className="muted">{t.reviewHint}</p>
              <label htmlFor={`comment-${matchId}`}>
                {t.comment}
                <textarea id={`comment-${matchId}`} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
              </label>
              <div className="row-actions">
                <button type="button" className="button" disabled={busy} onClick={() => void post({ action: "review", matchId, decision: "confirmed", comment, organizationId: data.organization_id }, t.confirmed)}>
                  {t.confirm}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy || !comment.trim()}
                  onClick={() => void post({ action: "review", matchId, decision: "contested", comment, organizationId: data.organization_id }, t.contested)}
                >
                  {t.contest}
                </button>
              </div>
            </div>
          ) : (
            <p className="muted">{t.reviewClosed}</p>
          ))}
        </>
      )}
    </section>
  );
}
