"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { journeyView } from "@/domains/competitions/journey";
import { flushActions, loadSideline, pendingActions, popAction, queueAction, saveSideline, type QueuedAction } from "@/lib/offline-queue";
import { errors } from "./access-copy";
import { sidelineCopy, fill } from "./sideline-copy";
import { journeyCopy } from "./match-journey-copy";
import { Tabs } from "./ui";

/**
 * 14: « Bord de terrain ». One column, big buttons, strong contrast, usable
 * with one hand. Every action goes to the waiting line of the device first
 * and leaves in order as soon as there is network; a refusal is told without
 * blocking the others; « Annuler la dernière action » is always there. The
 * match's data is kept on the device for the day (no health datum), and the
 * screen stays awake when the browser allows it.
 */
type View = Extract<Awaited<ReturnType<typeof journeyView>>, { manage: true }>;
type Step = "presence" | "lineup" | "match" | "end";
type LiveEvent = { id: string; client_id: string; kind: string; profile_id: string | null; name: string; minute: number | null; cancelled_at: string | null };

export function Sideline({ locale, id }: { locale: Locale; id: string }) {
  const t = sidelineCopy[locale];
  const [data, setData] = useState<View | null>(null),
    [error, setError] = useState(""),
    [step, setStep] = useState<Step>("presence"),
    [queue, setQueue] = useState<QueuedAction[]>([]),
    [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine),
    [note, setNote] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/matches/journey?id=${id}`, { cache: "no-store" });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      if (!v.manage) throw new Error("FORBIDDEN");
      // What the screen needs without network: ids, names, numbers, classification, line-up; never a health datum.
      saveSideline(id, v);
      setData(v);
      setError("");
    } catch (e) {
      const cached = loadSideline<View>(id);
      if (cached && (e as Error).message !== "FORBIDDEN" && (e as Error).message !== "NOT_FOUND") setData(cached);
      else setError(errors[(e as Error).message]?.[locale] ?? t.unavailable);
    }
  }, [id, locale, t.unavailable]);
  const send = useCallback(
    (body: Record<string, unknown>) =>
      fetch("/api/matches/journey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, id, organizationId: data?.organization_id }) }),
    [id, data?.organization_id],
  );
  const flush = useCallback(async () => {
    if (!navigator.onLine || !pendingActions(id).length) return;
    const r = await flushActions(id, send);
    setQueue(pendingActions(id));
    setNote([r.sent ? fill(t.synced, { n: r.sent }) : "", r.refused.length ? fill(t.refused, { list: r.refused.join(", ") }) : ""].filter(Boolean).join(" "));
    if (r.sent || r.refused.length) await load();
  }, [id, send, load, t]);
  useEffect(() => {
    // Loading at mount and following the network are subscriptions to the outside world.
    void Promise.resolve()
      .then(load)
      .then(() => setQueue(pendingActions(id)));
    const up = () => {
      setOnline(true);
      void flush();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [load, flush, id]);
  // The screen stays awake during the match (Wake Lock API, when the browser has it).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (k: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, []);

  /** Every action: to the waiting line, then out at once when there is network. */
  const act = useCallback(
    async (label: string, body: Record<string, unknown>) => {
      queueAction({ key: crypto.randomUUID(), matchId: id, label, body });
      setQueue(pendingActions(id));
      await flush();
    },
    [id, flush],
  );
  async function undo() {
    const last = popAction(id);
    if (last) {
      setQueue(pendingActions(id));
      return setNote(t.undone);
    }
    const sent = (data?.live ?? []).filter((e) => !e.cancelled_at);
    const latest = sent[sent.length - 1];
    if (!latest) return setNote(t.nothingToUndo);
    await act(t.undo, { action: "undoLive", eventId: latest.id });
    setNote(t.undone);
  }

  if (!data)
    return (
      <main id="main" className="sideline">
        <h1>{t.title}</h1>
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  // The day's events: the server's, then those still waiting on the device.
  const waitingLive: LiveEvent[] = queue
    .filter((q) => q.body.action === "live")
    .map((q) => ({ id: String(q.body.clientId), client_id: String(q.body.clientId), kind: String(q.body.kind), profile_id: (q.body.profileId as string | null) ?? null, name: data.lineup.find((x) => x.profile_id === q.body.profileId)?.full_name ?? "", minute: (q.body.minute as number | null) ?? null, cancelled_at: null }));
  const undone = new Set(queue.filter((q) => q.body.action === "undoLive").map((q) => String(q.body.eventId)));
  const events = [...(data.live as LiveEvent[]).filter((e) => !e.cancelled_at && !undone.has(e.id) && !waitingLive.some((w) => w.client_id === e.client_id)), ...waitingLive];
  const ours = events.filter((e) => e.kind === "goal").length,
    theirs = events.filter((e) => e.kind === "goal_against").length;
  const waitingPresence = new Map(queue.filter((q) => q.body.action === "presence").map((q) => [String(q.body.profileId), String(q.body.actual)]));
  return (
    <main id="main" className="sideline">
      <header className="sideline-head">
        <p>
          <Link href={`/${locale}/matches/${id}`}>{t.back}</Link>
        </p>
        <h1>
          {data.match.team} <span className="sideline-score" aria-live="polite">{ours} - {theirs}</span> {data.match.opponent}
        </h1>
        <p className={online ? "sideline-net" : "sideline-net sideline-offline"} role="status">
          {online ? (queue.length ? fill(t.waiting, { n: queue.length }) : t.online) : fill(t.offline, { n: queue.length })}
        </p>
        <button type="button" className="button secondary sideline-big" onClick={() => void undo()}>
          {t.undo}
        </button>
        <p role="status" className="sideline-note">
          {note}
        </p>
      </header>
      <Tabs label={t.title} items={(["presence", "lineup", "match", "end"] as const).map((k) => ({ id: k, label: t.steps[k] }))} value={step} onChange={(k) => setStep(k as Step)} idPrefix="side-tab" panelId={(k) => `side-panel-${k}`} />
      <section role="tabpanel" id={`side-panel-${step}`} aria-labelledby={`side-tab-${step}`} className="sideline-panel">
        {step === "presence" && <Presence locale={locale} data={data} waiting={waitingPresence} act={act} />}
        {step === "lineup" && <Lineup locale={locale} data={data} />}
        {step === "match" && <MatchStep locale={locale} data={data} events={events} act={act} />}
        {step === "end" && <End locale={locale} data={data} events={events} ours={ours} theirs={theirs} queue={queue.length} online={online} send={send} reload={load} />}
      </section>
    </main>
  );
}

function Presence({ locale, data, waiting, act }: { locale: Locale; data: View; waiting: Map<string, string>; act: (label: string, body: Record<string, unknown>) => Promise<void> }) {
  const t = sidelineCopy[locale];
  const invited = data.players.filter((p) => p.answer !== null);
  if (!invited.length) return <p>{t.noneInvited}</p>;
  const said = (a: string | null) => (a === "present" || a === "late" || a === "early" ? t.present : a === "absent" ? t.absent : a === "excused" ? t.excused : t.unchecked);
  return (
    <>
      <h2>{t.invited}</h2>
      <ul className="sideline-list">
        {invited.map((p) => {
          const actual = waiting.get(p.profile_id) ?? p.actual;
          const mark = (a: "present" | "absent" | "excused", label: string) => void act(fill(label, { name: p.full_name }), { action: "presence", profileId: p.profile_id, actual: a });
          return (
            <li key={p.profile_id} data-actual={actual ?? "unchecked"}>
              <button type="button" className="sideline-big sideline-person" aria-pressed={actual === "present"} onClick={() => mark("present", t.markPresent)}>
                <span>
                  {p.jersey_number !== null ? `${p.jersey_number} · ` : ""}
                  {p.full_name}
                </span>
                <span className="sideline-state">{said(actual)}</span>
              </button>
              <span className="sideline-row">
                <button type="button" className="button secondary sideline-big" aria-label={fill(t.markAbsent, { name: p.full_name })} onClick={() => mark("absent", t.markAbsent)}>
                  {t.absent}
                </button>
                <button type="button" className="button secondary sideline-big" aria-label={fill(t.markExcused, { name: p.full_name })} onClick={() => mark("excused", t.markExcused)}>
                  {t.excused}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Lineup({ locale, data }: { locale: Locale; data: View }) {
  const t = sidelineCopy[locale];
  if (!data.lineup.length)
    return (
      <p>
        {t.noLineup} <Link href={`/${locale}/matches/${data.match.id}`}>{t.editLineup}</Link>
      </p>
    );
  const problems = (pid: string) => data.players.find((p) => p.profile_id === pid)?.blocking ?? [];
  const list = (starter: boolean) => (
    <ul className="sideline-list">
      {data.lineup
        .filter((l) => l.starter === starter)
        .map((l) => (
          <li key={l.profile_id}>
            <strong>
              {l.jersey_number !== null ? `${l.jersey_number} · ` : ""}
              {l.full_name}
            </strong>{" "}
            <span className="muted">{l.classification.toUpperCase().replace("_", " ")}</span>
            {problems(l.profile_id).length > 0 && <span className="sideline-alert"> {fill(t.blocked, { list: problems(l.profile_id).map((x) => journeyCopy[locale].problems[x]).join(", ") })}</span>}
          </li>
        ))}
    </ul>
  );
  return (
    <>
      <h2>{t.starters}</h2>
      {list(true)}
      <h2>{t.subs}</h2>
      {list(false)}
      <p>
        <Link className="button secondary sideline-big" href={`/${locale}/matches/${data.match.id}`}>
          {t.editLineup}
        </Link>
      </p>
    </>
  );
}

function MatchStep({ locale, data, events, act }: { locale: Locale; data: View; events: LiveEvent[]; act: (label: string, body: Record<string, unknown>) => Promise<void> }) {
  const t = sidelineCopy[locale];
  const [form, setForm] = useState<"goal" | "card" | "sub" | null>(null);
  // The optional stopwatch: started at, what ran before a pause, and the last tick (set by the handlers and the interval, never while rendering).
  const [clock, setClock] = useState<{ since: number | null; before: number; now: number }>({ since: null, before: 0, now: 0 });
  useEffect(() => {
    if (clock.since === null) return;
    const timer = setInterval(() => setClock((c) => ({ ...c, now: Date.now() })), 15000);
    return () => clearInterval(timer);
  }, [clock.since]);
  const shown = clock.since === null ? clock.before : clock.before + Math.max(0, clock.now - clock.since);
  const m = clock.since === null && !clock.before ? null : Math.floor(shown / 60000);
  const minuteNow = () => (clock.since === null && !clock.before ? null : Math.floor((clock.before + (clock.since === null ? 0 : Date.now() - clock.since)) / 60000));
  const live = (label: string, kind: string, profileId: string | null) => act(label, { action: "live", clientId: crypto.randomUUID(), kind, profileId, minute: minuteNow() });
  const removeLast = (kind: string, label: string) => {
    const last = [...events].reverse().find((e) => e.kind === kind);
    if (last) void act(label, { action: "undoLive", eventId: last.id });
  };
  const players = data.lineup;
  const label = (pid: string | null) => players.find((p) => p.profile_id === pid)?.full_name ?? "";
  function goal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const scorer = String(f.get("scorer")),
      assist = String(f.get("assist") ?? "");
    void live(`${t.kinds.goal} ${label(scorer)}`, "goal", scorer);
    if (assist) void live(`${t.kinds.assist} ${label(assist)}`, "assist", assist);
    setForm(null);
  }
  function card(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const who = String(f.get("player")),
      kind = String(f.get("color"));
    void live(`${t.kinds[kind]} ${label(who)}`, kind, who);
    setForm(null);
  }
  function sub(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void live(`${t.kinds.sub_out} ${label(String(f.get("out")))}`, "sub_out", String(f.get("out")));
    void live(`${t.kinds.sub_in} ${label(String(f.get("in")))}`, "sub_in", String(f.get("in")));
    setForm(null);
  }
  const options = (name: string, id: string, title: string, extra?: string) => (
    <label htmlFor={id}>
      {title}
      <select id={id} name={name} className="sideline-big" required={!extra}>
        {extra && <option value="">{extra}</option>}
        {players.map((p) => (
          <option key={p.profile_id} value={p.profile_id}>
            {p.jersey_number !== null ? `${p.jersey_number} · ` : ""}
            {p.full_name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <div className="sideline-scoreboard">
        <div>
          <p className="sideline-side">{t.ours}</p>
          <button type="button" className="button sideline-big" onClick={() => setForm("goal")} disabled={!players.length}>
            + <span className="sr-only">{t.plusOurs}</span>
          </button>
          <button type="button" className="button secondary sideline-big" onClick={() => removeLast("goal", t.minusOurs)}>
            - <span className="sr-only">{t.minusOurs}</span>
          </button>
        </div>
        <div>
          <p className="sideline-side">{t.theirs}</p>
          <button type="button" className="button danger sideline-big" onClick={() => void live(fill(t.plusTheirs, { opponent: data.match.opponent }), "goal_against", null)}>
            + <span className="sr-only">{fill(t.plusTheirs, { opponent: data.match.opponent })}</span>
          </button>
          <button type="button" className="button secondary sideline-big" onClick={() => removeLast("goal_against", fill(t.minusTheirs, { opponent: data.match.opponent }))}>
            - <span className="sr-only">{fill(t.minusTheirs, { opponent: data.match.opponent })}</span>
          </button>
        </div>
      </div>
      {form === "goal" && (
        <form className="sideline-form" onSubmit={goal}>
          {options("scorer", "side-scorer", t.scorer)}
          {options("assist", "side-assist", t.assister, t.noAssist)}
          <button type="submit" className="button sideline-big">
            {t.confirmGoal}
          </button>
          <button type="button" className="button secondary sideline-big" onClick={() => setForm(null)}>
            {t.cancel}
          </button>
        </form>
      )}
      {form === "card" && (
        <form className="sideline-form" onSubmit={card}>
          {options("player", "side-card-player", t.player)}
          <fieldset>
            <legend>{t.card}</legend>
            <label className="check sideline-big" htmlFor="side-yellow">
              <input id="side-yellow" type="radio" name="color" value="yellow" defaultChecked />
              {t.yellow}
            </label>
            <label className="check sideline-big" htmlFor="side-red">
              <input id="side-red" type="radio" name="color" value="red" />
              {t.red}
            </label>
          </fieldset>
          <button type="submit" className="button sideline-big">
            {t.card}
          </button>
          <button type="button" className="button secondary sideline-big" onClick={() => setForm(null)}>
            {t.cancel}
          </button>
        </form>
      )}
      {form === "sub" && (
        <form className="sideline-form" onSubmit={sub}>
          {options("out", "side-out", t.subOut)}
          {options("in", "side-in", t.subIn)}
          <button type="submit" className="button sideline-big">
            {t.confirmSub}
          </button>
          <button type="button" className="button secondary sideline-big" onClick={() => setForm(null)}>
            {t.cancel}
          </button>
        </form>
      )}
      {!form && (
        <div className="sideline-actions">
          <button type="button" className="button secondary sideline-big" disabled={!players.length} onClick={() => setForm("card")}>
            {t.card}
          </button>
          <button type="button" className="button secondary sideline-big" disabled={!players.length} onClick={() => setForm("sub")}>
            {t.sub}
          </button>
          <button type="button" className="button secondary sideline-big" onClick={() => void live(t.timeout, "timeout", null)}>
            {t.timeout}
          </button>
        </div>
      )}
      <fieldset className="sideline-clock">
        <legend>
          {t.clock} {m !== null ? fill(t.minute, { m }) : ""}
        </legend>
        {clock.since === null ? (
          <button
            type="button"
            className="button secondary sideline-big"
            onClick={() => {
              const now = Date.now();
              setClock((c) => ({ ...c, since: now, now }));
            }}
          >
            {t.start}
          </button>
        ) : (
          <button
            type="button"
            className="button secondary sideline-big"
            onClick={() => {
              const now = Date.now();
              setClock((c) => ({ since: null, before: c.before + now - (c.since ?? now), now }));
            }}
          >
            {t.pause}
          </button>
        )}
        <button type="button" className="button secondary sideline-big" onClick={() => setClock({ since: null, before: 0, now: 0 })}>
          {t.reset}
        </button>
      </fieldset>
      <h2>{t.events}</h2>
      {events.length ? (
        <ol className="sideline-events">
          {events.map((e) => (
            <li key={e.client_id}>
              {e.minute !== null ? `${e.minute}' · ` : ""}
              {t.kinds[e.kind] ?? e.kind}
              {e.name ? ` · ${e.name}` : ""}
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">{t.noEvents}</p>
      )}
    </>
  );
}

function End({ locale, data, events, ours, theirs, queue, online, send, reload }: { locale: Locale; data: View; events: LiveEvent[]; ours: number; theirs: number; queue: number; online: boolean; send: (b: Record<string, unknown>) => Promise<Response>; reload: () => Promise<void> }) {
  const t = sidelineCopy[locale];
  const [status, setStatus] = useState(""),
    [announcement, setAnnouncement] = useState<string | null>(data.announcement);
  const scorers = [...new Set(events.filter((e) => e.kind === "goal").map((e) => e.name))].filter(Boolean);
  async function validate() {
    if (!online || queue) return setStatus(t.needOnline);
    const r = await send({ action: "validate", version: data.match.version, ourScore: ours, theirScore: theirs });
    const v = await r.json().catch(() => ({}));
    if (!r.ok) return setStatus(t.errors[v.error] ?? errors[v.error]?.[locale] ?? String(v.error));
    if (v.announcement) setAnnouncement(String(v.announcement));
    setStatus(t.validated);
    await reload();
  }
  async function photo(file: File | undefined) {
    if (!file) return;
    const base64 = await new Promise<string>((ok, ko) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1] ?? "");
      r.onerror = () => ko(r.error);
      r.readAsDataURL(file);
    });
    const r = await send({ action: "sheetPhoto", type: file.type, base64 });
    setStatus(r.ok ? t.photoSaved : t.needOnline);
  }
  return (
    <>
      <h2>{t.summary}</h2>
      <p className="sideline-final">
        {t.score} : {data.match.team} {ours} - {theirs} {data.match.opponent}
      </p>
      <p>{scorers.length ? fill(t.scorers, { names: scorers.join(", ") }) : t.noScorer}</p>
      <button type="button" className="button sideline-big" disabled={data.match.status === "played" && !!data.match.validated_at} onClick={() => void validate()}>
        {t.validate}
      </button>
      <label htmlFor="side-photo" className="sideline-file">
        {t.photo}
        <input id="side-photo" type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => void photo(e.target.files?.[0])} />
      </label>
      {announcement && (
        <p>
          <Link className="button secondary sideline-big" href={`/${locale}/communication`}>
            {t.announce}
          </Link>
        </p>
      )}
      <p role="status">{status}</p>
    </>
  );
}
