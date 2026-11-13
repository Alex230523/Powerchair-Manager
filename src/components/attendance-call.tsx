"use client";
import { brusselsToday } from "./chair-sheet";
import { useEffect, useState, type KeyboardEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { attendanceView } from "@/domains/attendance/service";
import { callSessions, myUpcoming, playerSummaries, segmentOf, segments, sortSummaries, splitStaff, type Segment } from "@/domains/attendance/rollcall";
import { queueMark } from "@/lib/offline-queue";
import { callCopy } from "./attendance-call-copy";
import { attendanceCopy } from "./attendance-copy";
import { kindLabels } from "./calendar-copy";
import { Badge, Button, Card, EmptyState, ExportButton, Segmented } from "./ui";
import { Icon, type IconName } from "./icons";
import { MoreMenu } from "./more-menu";
import { Modal } from "./modal";
import { initials } from "./app-shell";
import { useScope } from "./use-scope";
import { undoToast } from "./toast";
import { cssVars } from "./css-vars";
import { brusselsDay } from "@/lib/today";

export type View = Awaited<ReturnType<typeof attendanceView>>;
type Ev = View["events"][number];
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const page = 8;

/** The season of the top bar (or the last twelve months), loaded once for the roll call and the statistics. */
export function useSeasonAttendance(revision: number) {
  const scope = useScope();
  const today = brusselsToday();
  // No Date.now in render (the purity rule): the day 360 days before, from a new Date.
  const back = new Date();
  back.setUTCDate(back.getUTCDate() - 360);
  const yearAgo = back.toISOString().slice(0, 10);
  const from = scope.season?.starts_on ?? yearAgo;
  const to = scope.season?.ends_on ?? today;
  const [state, setState] = useState<{ key: string; data: View | null; error: string }>({ key: "", data: null, error: "" });
  const key = [from, to, revision].join("|");
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/attendance?" + new URLSearchParams({ from, to, team: "", place: "" }), { signal: abort.signal, cache: "no-store" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        setState({ key, data: body, error: "" });
      })
      .catch((e: Error) => {
        if (!abort.signal.aborted) setState((s) => ({ key, data: s.data, error: e.message || "OFFLINE" }));
      });
    return () => abort.abort();
  }, [from, to, key]);
  return { data: state.data, error: state.error, loading: state.key !== key, season: scope.season, team: scope.teamId ?? "", setData: (data: View) => setState((s) => ({ ...s, data })) };
}

const icons: Record<Segment, IconName> = { present: "check", absent: "close", excused: "clock", unchecked: "ban" };
const answerTone = (r: string) => (r === "present" ? "success" : r === "absent" ? "danger" : r === "uncertain" ? "warning" : "neutral");

/**
 * Wave 17 (J2): « Appel ». One session at a time, a line per invited
 * player with their average and their answer, four choices saved at each
 * click (and undone from the message), « Tout présent », « Clôturer
 * l'appel ». After closing, a correction asks for a reason.
 */
export function AttendanceCall({
  locale,
  data,
  team,
  send,
  reload,
  busy,
  onOffline,
}: {
  locale: Locale;
  data: View;
  team: string;
  send: (body: Record<string, unknown>) => Promise<{ undo?: string; count?: number } | null>;
  reload: () => unknown;
  busy: boolean;
  onOffline: (body: Record<string, unknown>) => void;
}) {
  const t = callCopy[locale];
  const a = attendanceCopy[locale];
  const [now] = useState(() => Date.now());
  const sessions = callSessions(data.events, team, now);
  const [chosen, setChosen] = useState<string | null>(null),
    [offset, setOffset] = useState(0),
    [fixing, setFixing] = useState<null | { id: string; version: number; actual: string; name: string }>(null);
  const summaries = new Map([...playerSummaries(data.events), ...playerSummaries(data.events, true)].map((s) => [s.profileId, s]));
  if (!sessions.length) return <EmptyState title={t.noSession} />;
  const e: Ev = sessions.find((s) => s.id === chosen) ?? sessions[0];
  const at = Math.max(0, sessions.indexOf(e));
  const start = Math.min(offset, Math.max(0, sessions.length - page));
  const shown = sessions.slice(start, start + page);
  const r = e.register!;
  const closed = !!r.closed_at;
  const people = e.invitations.filter((i) => !i.withdrawn_at);
  const day = (d: Date | string, long = false) =>
    new Intl.DateTimeFormat(tag(locale), long ? { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" } : { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Brussels" }).format(
      new Date(d),
    );
  async function mark(i: { id: string; version: number; actual: string }, actual: string, reason = "") {
    if (actual === i.actual) return;
    const body = { action: "mark", id: i.id, expectedVersion: i.version, actual, reason };
    if (typeof navigator !== "undefined" && !navigator.onLine) return onOffline(body);
    const out = await send(body);
    if (out) undoToast(locale, t.saved, out.undo, data.context.organization_id, reload);
  }
  function choose(i: (typeof people)[number], actual: string) {
    if (closed) setFixing({ id: i.id, version: i.version, actual, name: i.full_name });
    else void mark(i, actual);
  }
  /** Radio group: arrows move and choose, as in any set of options. */
  function keys(ev: KeyboardEvent<HTMLDivElement>, i: (typeof people)[number]) {
    const k = ev.key;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(k)) return;
    ev.preventDefault();
    const at = segments.indexOf(segmentOf(i.actual));
    const next = segments[(at + (k === "ArrowRight" || k === "ArrowDown" ? 1 : segments.length - 1)) % segments.length];
    ev.currentTarget.querySelector<HTMLButtonElement>(`[data-choice="${next}"]`)?.focus();
    choose(i, next);
  }
  const groups = splitStaff(people);
  const row = (i: (typeof people)[number]) => {
    const seg = segmentOf(i.actual);
    const avg = summaries.get(i.profile_id)?.rate;
    return (
      <li key={i.id} className="call-row">
        <span className="avatar" aria-hidden="true">
          {initials(i.full_name)}
        </span>
        <div className="call-who">
          <strong>{i.full_name}</strong>
          <span className="muted small">{avg == null ? t.noAverage : fill(t.average, { n: avg })}</span>
          {(i.actual === "late" || i.actual === "early") && <Badge tone="warning">{i.actual === "late" ? t.late : t.early}</Badge>}
        </div>
        <span className="call-answer">
          <Badge tone={answerTone(i.response)}>{t.answered[i.response as keyof typeof t.answered] ?? t.answered.none}</Badge>
        </span>
        <div className="call-choice" role="radiogroup" aria-label={fill(t.markOf, { name: i.full_name })} onKeyDown={(ev) => keys(ev, i)}>
          {segments.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              data-choice={s}
              aria-checked={seg === s}
              tabIndex={seg === s ? 0 : -1}
              disabled={busy}
              onClick={() => choose(i, s)}
            >
              <Icon name={icons[s]} size={16} />
              <span className="call-choice-label">{t.segments[s]}</span>
            </button>
          ))}
        </div>
        <MoreMenu
          label={fill(t.moreOf, { name: i.full_name })}
          items={[
            { label: t.late, run: () => choose(i, "late") },
            { label: t.early, run: () => choose(i, "early") },
          ]}
        />
      </li>
    );
  };
  return (
    <Card className="call-card">
      <div className="call-head">
        <div>
          <h2 className="call-title">{e.title}</h2>
          <p className="muted">
            {day(e.starts_at, true)}
            {e.place_name ? ` · ${e.place_name}` : ""}
            {e.team_name ? ` · ${e.team_name}` : ""} · {kindLabels[locale][e.kind as keyof typeof kindLabels.fr] ?? e.kind}
          </p>
        </div>
        <div className="call-actions">
        <ExportButton
          locale={locale}
          organizationId={data.context.organization_id}
          dataset="attendanceCall"
          subject={`${t.call} ${e.title}`}
          period={day(e.starts_at)}
          rows={people}
          columns={[
            { id: "name", label: t.cols.name, value: (i) => i.full_name },
            { id: "response", label: t.cols.response, value: (i) => t.answered[i.response as keyof typeof t.answered] ?? t.answered.none },
            { id: "mark", label: t.cols.mark, value: (i) => a.actuals[i.actual as keyof typeof a.actuals] ?? i.actual },
            { id: "average", label: t.cols.rate, type: "number", value: (i) => summaries.get(i.profile_id)?.rate ?? null },
          ]}
        />
        {!closed && (
          <Button
            icon="checkAll"
            disabled={busy || !people.some((i) => i.actual === "unchecked")}
            onClick={async () => {
              const out = await send({ action: "markAll", id: r.id, expectedVersion: r.version });
              if (out) undoToast(locale, fill(t.allDone, { n: out.count ?? 0 }), out.undo, data.context.organization_id, reload);
            }}
          >
            {t.allPresent}
          </Button>
        )}
        </div>
      </div>
      <div className="call-sessions" role="group" aria-label={t.session}>
        <span className="call-sessions-label">{t.session}</span>
        {start + page < sessions.length && (
          <button type="button" className="icon-button sm" aria-label={t.older} title={t.older} onClick={() => setOffset(start + page)}>
            <Icon name="back" size={16} />
          </button>
        )}
        {[...shown].reverse().map((s) => (
          <button
            key={s.id}
            type="button"
            className="call-pill"
            aria-pressed={s.id === e.id}
            onClick={() => setChosen(s.id)}
            title={s.title}
          >
            {day(s.starts_at)}
            <span className="sr-only"> · {s.title}</span>
          </button>
        ))}
        {start > 0 && (
          <button type="button" className="icon-button sm" aria-label={t.newer} title={t.newer} onClick={() => setOffset(Math.max(0, start - page))}>
            <Icon name="arrow" size={16} />
          </button>
        )}
        <span className="sr-only" aria-live="polite">
          {at >= 0 ? `${e.title} · ${day(e.starts_at)}` : ""}
        </span>
      </div>
      {closed && <p className="notice">{t.closed}</p>}
      {people.length ? (
        <>
          {groups.staff.length > 0 && <h3 className="call-group">{t.players}</h3>}
          <ul className="call-list" aria-label={t.players}>{groups.players.map(row)}</ul>
          {groups.staff.length > 0 && (
            <>
              <h3 className="call-group">{t.staff}</h3>
              <ul className="call-list" aria-label={t.staff}>{groups.staff.map(row)}</ul>
            </>
          )}
        </>
      ) : (
        <EmptyState title={t.noInvited} />
      )}
      {!closed && people.length > 0 && (
        <div className="call-foot">
          <p className="muted small">{t.closeHint}</p>
          <Button variant="secondary" disabled={busy} onClick={() => void send({ action: "close", id: r.id, expectedVersion: r.version })}>
            {t.close}
          </Button>
        </div>
      )}
      {fixing && (
        <Modal title={fill(t.correction, { name: fixing.name })} close={() => setFixing(null)}>
          <form
            className="stack-form"
            onSubmit={async (ev) => {
              ev.preventDefault();
              const reason = String(new FormData(ev.currentTarget).get("reason") ?? "").trim();
              const out = await send({ action: "mark", id: fixing.id, expectedVersion: fixing.version, actual: fixing.actual, reason });
              if (out) setFixing(null);
            }}
          >
            <p>
              {a.actual} : <strong>{a.actuals[fixing.actual as keyof typeof a.actuals]}</strong>
            </p>
            <label>
              {t.reason}
              <textarea name="reason" required minLength={3} maxLength={1000} />
            </label>
            <div className="form-actions">
              <Button type="submit" disabled={busy}>
                {t.confirm}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setFixing(null)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}

/** Wave 17 (J2): « Statistiques », a card per player over the season of the top bar. */
export function AttendanceStats({ locale, data, team, seasonName }: { locale: Locale; data: View; team: string; seasonName: string | null }) {
  const t = callCopy[locale];
  const [by, setBy] = useState<"rate" | "name">("rate");
  const events = team ? data.events.filter((e) => e.team_id === team) : data.events;
  const list = sortSummaries(playerSummaries(events), by);
  // 13/11/2026: the coaches' figures, apart, under the players'.
  const coaches = sortSummaries(playerSummaries(events, true), "name");
  return (
    <section className="call-stats" aria-label={t.stats}>
      <div className="call-stats-head">
        <p className="muted">{fill(t.period, { name: seasonName ?? "" })}</p>
        <div className="call-actions">
          <Segmented label={t.sortBy} items={[{ id: "rate", label: t.byRate }, { id: "name", label: t.byName }]} value={by} onChange={(v) => setBy(v as "rate" | "name")} />
          <ExportButton
            locale={locale}
            organizationId={data.context.organization_id}
            dataset="attendanceStats"
            subject={t.stats}
            period={seasonName ?? ""}
            rows={list}
            columns={[
              { id: "name", label: t.cols.name, value: (p) => p.name },
              { id: "trainingIn", label: t.cols.trainingsIn, type: "number", value: (p) => p.training.attended },
              { id: "trainingAll", label: t.cols.trainingsAll, type: "number", value: (p) => p.training.closed },
              { id: "matchIn", label: t.cols.matchesIn, type: "number", value: (p) => p.match.attended },
              { id: "matchAll", label: t.cols.matchesAll, type: "number", value: (p) => p.match.closed },
              { id: "excused", label: t.cols.excused, type: "number", value: (p) => p.excused },
              { id: "absent", label: t.cols.absent, type: "number", value: (p) => p.absent },
              { id: "rate", label: t.cols.rate, type: "number", value: (p) => p.rate },
            ]}
          />
        </div>
      </div>
      {list.length ? (
        <ul className="stat-cards">
          {list.map((p) => (
            <li key={p.profileId} className="stat-card">
              <div className="stat-card-who">
                <span className="avatar" aria-hidden="true">
                  {initials(p.name)}
                </span>
                <strong>{p.name}</strong>
              </div>
              <p className="small">{fill(t.training, { a: p.training.attended, c: p.training.closed })}</p>
              <p className="small">{fill(t.matches, { a: p.match.attended, c: p.match.closed })}</p>
              {p.excused > 0 && <p className="small muted">{fill(t.excused, { n: p.excused })}</p>}
              <p className="stat-card-rate">
                <span className="sr-only">{t.averageLabel} : </span>
                {p.rate ?? 0} %
              </p>
              <span className="stat-card-bar" aria-hidden="true">
                <span style={cssVars({ value: p.rate ?? 0 })} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t.noStats} />
      )}
      {coaches.length > 0 && (
        <>
          <h3 className="call-group">{t.staffStats}</h3>
          <ul className="stat-cards" aria-label={t.staffStats}>
            {coaches.map((p) => (
              <li key={p.profileId} className="stat-card">
                <div className="stat-card-who">
                  <span className="avatar" aria-hidden="true">
                    {initials(p.name)}
                  </span>
                  <strong>{p.name}</strong>
                </div>
                <p className="small">{fill(t.training, { a: p.training.attended, c: p.training.closed })}</p>
                <p className="small">{fill(t.matches, { a: p.match.attended, c: p.match.closed })}</p>
                <p className="stat-card-rate">
                  <span className="sr-only">{t.averageLabel} : </span>
                  {p.rate ?? 0} %
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Offline marks of the roll call: kept on the device (same queue as the season grid). */
export function queueOffline(data: View, body: Record<string, unknown>) {
  return queueMark(String(body.id), { ...body, organizationId: data.context.organization_id });
}

/**
 * 13/11/2026: « Mes prochaines séances ». The viewer's own invitations over the
 * next three weeks, answered in one tap: a coach says whether he will be at
 * the training as his players do, without searching for his line in the call.
 */
export function MyNextSessions({ locale, revision, onAnswered }: { locale: Locale; revision: number; onAnswered: () => void }) {
  const t = callCopy[locale];
  const [now] = useState(() => Date.now());
  const [data, setData] = useState<View | null>(null),
    [busy, setBusy] = useState(""),
    [status, setStatus] = useState(""),
    [own, setOwn] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    const from = brusselsDay(new Date(now)),
      to = brusselsDay(new Date(now + 21 * 86400000));
    fetch("/api/attendance?" + new URLSearchParams({ from, to, team: "", place: "" }), { signal: abort.signal, cache: "no-store" })
      .then(async (r) => (r.ok ? setData((await r.json()) as View) : null))
      .catch(() => undefined);
    return () => abort.abort();
  }, [now, revision, own]);
  if (!data) return null;
  const list = myUpcoming(data.events, now);
  if (!list.length) return null;
  const day = (d: Date | string) =>
    new Intl.DateTimeFormat(tag(locale), { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(d));
  async function answer(i: (typeof list)[number]["invitation"], response: "present" | "absent" | "uncertain") {
    if (!data || i.response === response) return;
    setBusy(i.id);
    setStatus("");
    try {
      const r = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: data.context.organization_id, action: "respond", id: i.id, expectedVersion: i.version, response, comment: i.comment ?? "", ...(response === "absent" ? { absenceReason: "other" } : {}) }),
      });
      if (!r.ok) throw new Error();
      setStatus(t.saved);
      setOwn((v) => v + 1);
      onAnswered();
    } catch {
      setStatus(attendanceCopy[locale].error);
    } finally {
      setBusy("");
    }
  }
  return (
    <Card title={t.mine} className="my-next" labelledBy="my-next-title" headingId="my-next-title">
      <p className="muted small">{t.mineIntro}</p>
      <ul className="my-next-list">
        {list.map(({ event: e, invitation: i }) => (
          <li key={e.id} className="my-next-row">
            <div className="my-next-what">
              <strong>{e.title}</strong>
              <span className="muted small">
                {day(e.starts_at)}
                {e.place_name ? ` · ${e.place_name}` : ""}
                {e.team_name ? ` · ${e.team_name}` : ""}
              </span>
            </div>
            <div className="my-next-choice" role="group" aria-label={fill(t.mineOf, { title: `${e.title}, ${day(e.starts_at)}` })}>
              {(["present", "absent", "uncertain"] as const).map((v) => (
                <Button key={v} variant={i.response === v ? "primary" : "secondary"} aria-pressed={i.response === v} disabled={!!busy} onClick={() => void answer(i, v)}>
                  {t.mineAnswer[v]}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </Card>
  );
}
