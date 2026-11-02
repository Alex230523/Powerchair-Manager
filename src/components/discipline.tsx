"use client";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { disciplineHistory, disciplineView } from "@/domains/discipline/service";
import { competitions } from "@/domains/discipline/schema";
import { errors } from "./access-copy";
import { disciplineCopy, fill } from "./discipline-copy";
import { useData, usePost } from "./use-api";
import { Badge, Card, EmptyState, PageHeader } from "./ui";

/**
 * 34: the federation's discipline. The desk (proposals, running
 * suspensions, players close to the threshold, appeals, fines, a manual
 * decision, the season's rules), the club's page (its sanctions, appeals and
 * fines) and a player's history on his sheet.
 */
type View = Awaited<ReturnType<typeof disciplineView>>;
type Fed = Extract<View, { kind: "federation" }>;
type Club = Extract<View, { kind: "club" }>;
type Sanction = Fed["proposed"][number];
type Act = (body: Record<string, unknown>, done: string) => Promise<boolean>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const day = (l: Locale, d: string | null) => (d ? new Intl.DateTimeFormat(tag(l), { dateStyle: "long", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z")) : "");
const money = (l: Locale, cents: number) => new Intl.NumberFormat(tag(l), { style: "currency", currency: "EUR" }).format(cents / 100);
const euros = (v: FormDataEntryValue | null) => Math.round(Number(v ?? 0) * 100);

async function fileData(file: File | null) {
  if (!file || !file.size) return null;
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("INVALID_FILE"));
    r.readAsDataURL(file);
  });
  return { filename: file.name, mediaType: file.type, data };
}

function useDiscipline(locale: Locale) {
  const t = disciplineCopy[locale];
  const failure = useCallback((code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable, [t, locale]);
  const { data, error, setError, denied, reload } = useData<View>("/api/discipline", failure);
  const { busy, message, post } = usePost("/api/discipline", reload, setError, failure);
  const act: Act = (body, done) => post({ ...body, organizationId: data?.organization_id }, done);
  return { t, data, error, denied, busy, message, act };
}

/** One line of a sanction: who, why, how much. */
function SanctionLine({ locale, s }: { locale: Locale; s: Sanction }) {
  const t = disciplineCopy[locale];
  return (
    <>
      <strong>{s.name ?? s.club}</strong>{" "}
      <span className="muted">
        · {s.name ? s.club : t.targets.club} · {t.causes[s.cause]}
        {s.card_match ? ` · ${fill(t.inMatch, { match: s.card_match })}` : ""}
        {s.summary ? ` · ${s.summary}` : ""}
      </span>
      <span className="discipline-figures">
        {fill(t.matchesOf, { n: s.matches })}
        {s.fine_cents ? ` · ${fill(t.fineOf, { amount: money(locale, s.fine_cents) })}` : ""}
        {s.status === "confirmed" && s.matches > 0 ? ` · ${s.remaining ? fill(t.remaining, { n: s.remaining }) : t.served}` : ""}
        {s.status === "confirmed" && s.appeal_until ? ` · ${fill(t.appealUntil, { date: day(locale, s.appeal_until) })}` : ""}
      </span>
    </>
  );
}

export function FederationDiscipline({ locale }: { locale: Locale }) {
  const { t, data, error, denied, busy, message, act } = useDiscipline(locale);
  const fed = data?.kind === "federation" ? data : null;
  return (
    <main id="main" className="access discipline">
      <PageHeader title={t.title} subtitle={t.fedIntro} />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {denied && <p className="notice">{t.denied}</p>}
      {!data && !denied && !error && <p role="status">{t.loading}</p>}
      {fed && (
        <div className="grid">
          <Card title={t.proposed} labelledBy="dis-proposed" headingId="dis-proposed">
            {fed.proposed.length ? (
              <ul className="records">
                {fed.proposed.map((s) => (
                  <li key={s.id}>
                    <Decide locale={locale} s={s} busy={busy} act={act} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={t.noProposed} />
            )}
          </Card>
          <Card title={t.running} labelledBy="dis-running" headingId="dis-running">
            {fed.running.length ? (
              <ul className="records">
                {fed.running.map((s) => (
                  <li key={s.id}>
                    <SanctionLine locale={locale} s={s} />
                    {s.profile_id && <History locale={locale} profileId={s.profile_id} />}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={t.noRunning} />
            )}
          </Card>
          <Card title={t.near} labelledBy="dis-near" headingId="dis-near">
            <p className="muted">{t.nearHint}</p>
            {fed.near.length ? (
              <ul className="records">
                {fed.near.map((n) => (
                  <li key={n.profile_id}>
                    <strong>{n.name}</strong> <span className="muted">· {n.club}</span> <Badge tone="warning">{fill(t.yellows, { n: n.n })}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t.noNear}</p>
            )}
          </Card>
          <Card title={t.appeals} labelledBy="dis-appeals" headingId="dis-appeals">
            {fed.appeals.length ? (
              <ul className="records">
                {fed.appeals.map((a) => (
                  <li key={a.id}>
                    <AppealDecision locale={locale} a={a} busy={busy} act={act} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={t.noAppeal} />
            )}
          </Card>
          <Card title={t.fines} labelledBy="dis-fines" headingId="dis-fines">
            {fed.fines.length ? (
              <ul className="records">
                {fed.fines.map((f) => (
                  <li key={f.id}>
                    <strong>{f.club}</strong> · {money(locale, f.amount_cents)} <Badge tone={f.status === "paid" ? "success" : "warning"}>{t.fineStatus[f.status]}</Badge>{" "}
                    <span className="muted">{f.status === "paid" ? fill(t.paidOn, { date: day(locale, f.paid_on) }) : fill(t.dueOn, { date: day(locale, f.due_on) })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t.noFine}</p>
            )}
          </Card>
          <Manual locale={locale} fed={fed} busy={busy} act={act} />
          <Rules locale={locale} fed={fed} busy={busy} act={act} />
        </div>
      )}
    </main>
  );
}

function Decide({ locale, s, busy, act }: { locale: Locale; s: Sanction; busy: boolean; act: Act }) {
  const t = disciplineCopy[locale];
  const [matches, setMatches] = useState(s.matches),
    [fine, setFine] = useState(s.fine_cents / 100),
    [reason, setReason] = useState("");
  const id = (k: string) => `dis-${k}-${s.id}`;
  const changed = matches !== s.matches || Math.round(fine * 100) !== s.fine_cents;
  return (
    <div className="discipline-decide">
      <SanctionLine locale={locale} s={s} />
      <div className="form-pair">
        <label htmlFor={id("matches")}>
          {t.matches}
          <input id={id("matches")} type="number" inputMode="numeric" min={0} max={99} value={matches} onChange={(e) => setMatches(Number(e.target.value))} />
        </label>
        <label htmlFor={id("fine")}>
          {t.fine}
          <input id={id("fine")} type="number" inputMode="decimal" min={0} max={10000} step="0.01" value={fine} onChange={(e) => setFine(Number(e.target.value))} />
        </label>
      </div>
      <label htmlFor={id("reason")}>
        {t.reason}
        <input id={id("reason")} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="row-actions">
        <button
          type="button"
          className="button"
          disabled={busy || (changed && !reason.trim())}
          onClick={() => void act(changed ? { action: "decide", id: s.id, decision: "modify", matches, fineCents: Math.round(fine * 100), reason } : { action: "decide", id: s.id, decision: "confirm", reason }, t.saved)}
        >
          {changed ? t.modify : t.confirm}
          <span className="sr-only"> : {s.name ?? s.club}</span>
        </button>
        <button type="button" className="button secondary" disabled={busy || !reason.trim()} onClick={() => void act({ action: "decide", id: s.id, decision: "cancel", reason }, t.saved)}>
          {t.cancel}
          <span className="sr-only"> : {s.name ?? s.club}</span>
        </button>
      </div>
      {s.profile_id && <History locale={locale} profileId={s.profile_id} />}
    </div>
  );
}

function AppealDecision({ locale, a, busy, act }: { locale: Locale; a: Fed["appeals"][number]; busy: boolean; act: Act }) {
  const t = disciplineCopy[locale];
  const [decision, setDecision] = useState("");
  return (
    <div className="discipline-decide">
      <strong>{a.who}</strong> <span className="muted">· {a.club}</span>
      <p>{a.reason}</p>
      {a.file_name && (
        <p>
          <a href={`/api/discipline?file=${a.id}`} download>
            {t.proof} : {a.file_name}
          </a>
        </p>
      )}
      <label htmlFor={`appeal-decision-${a.id}`}>
        {t.decision}
        <textarea id={`appeal-decision-${a.id}`} maxLength={1000} value={decision} onChange={(e) => setDecision(e.target.value)} />
      </label>
      <div className="row-actions">
        <button type="button" className="button" disabled={busy} onClick={() => void act({ action: "decideAppeal", id: a.id, accept: true, decision }, t.saved)}>
          {t.accept}
          <span className="sr-only"> : {a.who}</span>
        </button>
        <button type="button" className="button secondary" disabled={busy || !decision.trim()} onClick={() => void act({ action: "decideAppeal", id: a.id, accept: false, decision }, t.saved)}>
          {t.reject}
          <span className="sr-only"> : {a.who}</span>
        </button>
      </div>
    </div>
  );
}

function Manual({ locale, fed, busy, act }: { locale: Locale; fed: Fed; busy: boolean; act: Act }) {
  const t = disciplineCopy[locale];
  const [club, setClub] = useState(""),
    [target, setTarget] = useState<"player" | "coach" | "club">("player");
  const people = fed.people.filter((p) => p.club_id === club && p.role === target);
  return (
    <Card title={t.manual} labelledBy="dis-manual" headingId="dis-manual">
      <p className="muted">{t.manualHint}</p>
      <form
        className="finance-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          const ok = await act(
            { action: "manual", clubId: club, target, profileId: target === "club" ? null : String(f.get("person") ?? ""), matches: Number(f.get("matches") ?? 0), fineCents: euros(f.get("fine")), summary: String(f.get("summary") ?? "") },
            t.saved,
          );
          if (ok) form.reset();
        }}
      >
        <label htmlFor="dis-club">
          {t.club}
          <select id="dis-club" required value={club} onChange={(e) => setClub(e.target.value)}>
            <option value="" disabled>
              {t.club}
            </option>
            {fed.clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>{t.target}</legend>
          {(["player", "coach", "club"] as const).map((k) => (
            <label key={k} className="check">
              <input type="radio" name="target" value={k} checked={target === k} onChange={() => setTarget(k)} />
              {t.targets[k]}
            </label>
          ))}
        </fieldset>
        {target !== "club" && (
          <label htmlFor="dis-person">
            {t.person}
            <select id="dis-person" name="person" required defaultValue="">
              <option value="" disabled>
                {t.person}
              </option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="form-pair">
          <label htmlFor="dis-manual-matches">
            {t.matches}
            <input id="dis-manual-matches" name="matches" type="number" inputMode="numeric" min={0} max={99} defaultValue={1} required />
          </label>
          <label htmlFor="dis-manual-fine">
            {t.fine}
            <input id="dis-manual-fine" name="fine" type="number" inputMode="decimal" min={0} max={10000} step="0.01" defaultValue={0} />
          </label>
        </div>
        <label htmlFor="dis-summary">
          {t.summary}
          <textarea id="dis-summary" name="summary" required minLength={3} maxLength={500} />
        </label>
        <button className="button" disabled={busy || !club}>
          {t.record}
        </button>
      </form>
    </Card>
  );
}

function Rules({ locale, fed, busy, act }: { locale: Locale; fed: Fed; busy: boolean; act: Act }) {
  const t = disciplineCopy[locale];
  const r = fed.rule;
  return (
    <Card title={t.rules} labelledBy="dis-rules" headingId="dis-rules">
      <p className="muted">{t.rulesHint}</p>
      <form
        className="finance-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void act(
            {
              action: "rules",
              season: String(f.get("season")),
              yellowThreshold: Number(f.get("yellowThreshold")),
              yellowMatches: Number(f.get("yellowMatches")),
              redMatches: Number(f.get("redMatches")),
              kinds: f.getAll("kinds").map(String),
              reset: String(f.get("reset")),
              yellowFineCents: euros(f.get("yellowFine")),
              redFineCents: euros(f.get("redFine")),
              appealDays: Number(f.get("appealDays")),
            },
            t.saved,
          );
        }}
      >
        <label htmlFor="dis-season">
          {t.season}
          <input id="dis-season" name="season" required pattern="\d{4}-\d{2}" defaultValue={fed.season} />
        </label>
        <div className="form-pair">
          <label htmlFor="dis-yt">
            {t.yellowThreshold}
            <input id="dis-yt" name="yellowThreshold" type="number" inputMode="numeric" min={1} max={20} required defaultValue={r.yellowThreshold} />
          </label>
          <label htmlFor="dis-ym">
            {t.yellowMatches}
            <input id="dis-ym" name="yellowMatches" type="number" inputMode="numeric" min={0} max={20} required defaultValue={r.yellowMatches} />
          </label>
        </div>
        <label htmlFor="dis-rm">
          {t.redMatches}
          <input id="dis-rm" name="redMatches" type="number" inputMode="numeric" min={0} max={20} required defaultValue={r.redMatches} />
        </label>
        <fieldset>
          <legend>{t.kinds}</legend>
          {competitions.map((k) => (
            <label key={k} className="check">
              <input type="checkbox" name="kinds" value={k} defaultChecked={r.kinds.includes(k)} />
              {t.competitions[k]}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>{t.reset}</legend>
          {(["season", "never"] as const).map((k) => (
            <label key={k} className="check">
              <input type="radio" name="reset" value={k} defaultChecked={r.reset === k} />
              {t.resets[k]}
            </label>
          ))}
        </fieldset>
        <div className="form-pair">
          <label htmlFor="dis-yf">
            {t.yellowFine}
            <input id="dis-yf" name="yellowFine" type="number" inputMode="decimal" min={0} max={10000} step="0.01" defaultValue={r.yellowFineCents / 100} />
          </label>
          <label htmlFor="dis-rf">
            {t.redFine}
            <input id="dis-rf" name="redFine" type="number" inputMode="decimal" min={0} max={10000} step="0.01" defaultValue={r.redFineCents / 100} />
          </label>
        </div>
        <label htmlFor="dis-ad">
          {t.appealDays}
          <input id="dis-ad" name="appealDays" type="number" inputMode="numeric" min={0} max={60} required defaultValue={r.appealDays} />
        </label>
        <button className="button" disabled={busy}>
          {t.saveRules}
        </button>
      </form>
      {fed.versions.length > 0 && (
        <>
          <h3>{t.versions}</h3>
          <ul className="records">
            {fed.versions.map((v) => (
              <li key={v.season + v.version}>
                {fill(t.versionOf, { season: v.season, version: v.version })} <span className="muted">· {day(locale, String(v.created_at))}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/** The club's page: its sanctions, an appeal within the delay, its fines. */
export function ClubDiscipline({ locale }: { locale: Locale }) {
  const { t, data, error, denied, busy, message, act } = useDiscipline(locale);
  const club = data?.kind === "club" ? data : null;
  return (
    <main id="main" className="access discipline">
      <PageHeader title={t.title} subtitle={t.clubIntro} />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {denied && <p className="notice">{t.denied}</p>}
      {!data && !denied && !error && <p role="status">{t.loading}</p>}
      {club && (
        <div className="grid">
          <Card title={t.sanctions} labelledBy="dis-sanctions" headingId="dis-sanctions">
            {club.sanctions.length ? (
              <ul className="records">
                {club.sanctions.map((s) => (
                  <li key={s.id}>
                    <SanctionLine locale={locale} s={s} /> <Badge tone={s.status === "cancelled" ? "neutral" : s.remaining ? "danger" : "success"}>{t.statuses[s.status]}</Badge>
                    {s.appeal && <Badge tone={s.appeal.status === "accepted" ? "success" : s.appeal.status === "rejected" ? "danger" : "warning"}>{t.appealStatus[s.appeal.status]}</Badge>}
                    {s.canAppeal && <AppealForm locale={locale} id={s.id} who={s.name ?? s.club} busy={busy} act={act} />}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={t.noSanction} />
            )}
          </Card>
          <Card title={t.fines} labelledBy="dis-club-fines" headingId="dis-club-fines">
            {club.fines.length ? (
              <ul className="records" id="fines">
                {club.fines.map((f) => (
                  <li key={f.id}>
                    {money(locale, f.amount_cents)} <Badge tone={f.status === "paid" ? "success" : "warning"}>{t.fineStatus[f.status]}</Badge>{" "}
                    <span className="muted">{f.status === "paid" ? fill(t.paidOn, { date: day(locale, f.paid_on) }) : fill(t.dueOn, { date: day(locale, f.due_on) })}</span>
                    {f.status === "due" && club.can.pay && (
                      <form
                        className="inline-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void act({ action: "payFine", id: f.id, paidOn: String(new FormData(e.currentTarget).get("paidOn")) }, t.saved);
                        }}
                      >
                        <label htmlFor={`paid-${f.id}`}>
                          {t.paidDate}
                          <input id={`paid-${f.id}`} name="paidOn" type="date" required defaultValue={club.today} max={club.today} />
                        </label>
                        <button className="button secondary" disabled={busy}>
                          {t.pay}
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t.noFine}</p>
            )}
          </Card>
        </div>
      )}
    </main>
  );
}

function AppealForm({ locale, id, who, busy, act }: { locale: Locale; id: string; who: string; busy: boolean; act: Act }) {
  const t = disciplineCopy[locale];
  return (
    <details className="report-details">
      <summary>
        {t.appeal}
        <span className="sr-only"> : {who}</span>
      </summary>
      <form
        className="finance-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          await act({ action: "appeal", sanctionId: id, reason: String(f.get("reason") ?? ""), file: await fileData(f.get("file") as File | null) }, t.appealSent);
        }}
      >
        <label htmlFor={`appeal-reason-${id}`}>
          {t.appealReason}
          <textarea id={`appeal-reason-${id}`} name="reason" required minLength={5} maxLength={4000} />
        </label>
        <label htmlFor={`appeal-file-${id}`}>
          {t.appealFile}
          <input id={`appeal-file-${id}`} name="file" type="file" accept="application/pdf,image/png,image/jpeg" />
        </label>
        <button className="button" disabled={busy}>
          {t.sendAppeal}
        </button>
      </form>
    </details>
  );
}

/** 6: a player's history, opened on demand (his club and his federation only). */
function History({ locale, profileId }: { locale: Locale; profileId: string }) {
  const t = disciplineCopy[locale];
  const [open, setOpen] = useState(false);
  return (
    <details className="report-details" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{t.showHistory}</summary>
      {open && <DisciplineHistory locale={locale} profileId={profileId} />}
    </details>
  );
}

export function DisciplineHistory({ locale, profileId, title }: { locale: Locale; profileId: string; title?: boolean }) {
  const t = disciplineCopy[locale];
  const failure = useCallback((code: string) => t.errors[code] ?? t.unavailable, [t]);
  const { data, error } = useData<Awaited<ReturnType<typeof disciplineHistory>>>(`/api/discipline?player=${profileId}`, failure);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">{t.loading}</p>;
  const seasons = [...new Set(data.cards.map((c) => c.season))];
  return (
    <div className="discipline-history">
      {title && <h3>{t.history}</h3>}
      {seasons.length > 0 && (
        <ul className="plain-list">
          {seasons.map((s) => (
            <li key={s}>
              {fill(t.cardsOf, {
                season: s,
                yellow: data.cards.find((c) => c.season === s && c.kind === "yellow")?.n ?? 0,
                red: data.cards.find((c) => c.season === s && c.kind === "red")?.n ?? 0,
              })}
            </li>
          ))}
        </ul>
      )}
      {data.sanctions.length ? (
        <ul className="records">
          {data.sanctions.map((s) => (
            <li key={s.id}>
              <SanctionLine locale={locale} s={s} /> <Badge tone={s.status === "cancelled" ? "neutral" : s.remaining ? "danger" : "success"}>{t.statuses[s.status]}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t.noHistory}</p>
      )}
    </div>
  );
}
