"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { journeyView } from "@/domains/competitions/journey";
import { flushLive, pendingLive, queueLive } from "@/lib/offline-queue";
import { journeyCopy, type JourneyCopy } from "./match-journey-copy";
import { errors } from "./access-copy";
import { fill } from "./fleet-copy";
import { Badge, Button, Card, EmptyState, PageHeader, Tabs } from "./ui";
import { ReportReview } from "./refereeing";
import { useData } from "./use-api";

/**
 * A5: one match sheet, three steps. « Avant »: the invitation and its answers,
 * the line-up among those present with its blocking problems and warnings,
 * the trip, the day's checklist sent to the to-do. « Jour J »: big buttons
 * for goals, cards and substitutions, kept on the phone without network.
 * « Après »: the result confirmed, the PDF sheet, the referee, the draft
 * announcement. Players and parents see their invitation, the published
 * line-up and the result.
 */
type View = Awaited<ReturnType<typeof journeyView>>;
type Managed = Extract<View, { manage: true }>;
type Member = Extract<View, { manage: false }>;
type Live = Managed["live"][number];
type Ctx = {
  t: JourneyCopy;
  locale: Locale;
  data: Managed;
  busy: boolean;
  error: string;
  send: (body: Record<string, unknown>, done: string | ((out: Record<string, unknown>) => string)) => Promise<Record<string, unknown> | null>;
  reload: () => Promise<void>;
};
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

export function MatchJourney({ locale, id }: { locale: Locale; id: string }) {
  const t = journeyCopy[locale];
  const failure = useCallback((code: string) => t.errors[code] ?? errors[code]?.[locale] ?? code, [t, locale]);
  const { data, error, setError, reload } = useData<View>(`/api/matches/journey?id=${id}`, failure);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [step, setStep] = useState<"before" | "day" | "after">("before");
  async function send(body: Record<string, unknown>, done: string | ((out: Record<string, unknown>) => string)) {
    if (!data) return null;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/matches/journey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, id, organizationId: data.organization_id }) });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error);
      await reload();
      setMessage(typeof done === "string" ? done : done(out));
      return out as Record<string, unknown>;
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
      return null;
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <main id="main" className="access match-journey">
        <PageHeader title={t.loading} />
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const m = data.match;
  const when = new Intl.DateTimeFormat(tag(locale), { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(m.starts_at));
  return (
    <main id="main" className="access match-journey">
      <p>
        <Link href={`/${locale}/matches`}>← {t.back}</Link>
      </p>
      <PageHeader
        title={m.home ? `${m.team} · ${m.opponent}` : `${m.opponent} · ${m.team}`}
        subtitle={[when, m.venue].filter(Boolean).join(" · ")}
        actions={
          <Link className="button secondary" href={`/${locale}/guide/game`}>
            {t.guideGame}
          </Link>
        }
      />
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {data.manage ? (
        <>
          <Tabs
            label={t.stepsLabel}
            items={(["before", "day", "after"] as const).map((k) => ({ id: k, label: t.steps[k] }))}
            value={step}
            onChange={(k) => setStep(k as typeof step)}
            idPrefix="journey-tab"
            panelId={(k) => `journey-panel-${k}`}
          />
          <div role="tabpanel" id={`journey-panel-${step}`} aria-labelledby={`journey-tab-${step}`} className="journey-panel">
            {step === "before" && <BeforeStep ctx={{ t, locale, data, busy, error, send, reload }} />}
            {step === "day" && <DayStep ctx={{ t, locale, data, busy, error, send, reload }} />}
            {step === "after" && <AfterStep ctx={{ t, locale, data, busy, error, send, reload }} />}
          </div>
        </>
      ) : (
        <MemberView t={t} data={data} />
      )}
    </main>
  );
}

function MemberView({ t, data }: { t: JourneyCopy; data: Member }) {
  return (
    <div className="journey-member">
      <Card title={t.yourCallUp}>
        {data.callUp.length ? (
          <ul className="records">
            {data.callUp.map((x) => (
              <li key={x.profile_id}>
                {x.full_name} · <Badge tone={x.response === "present" ? "success" : x.response === "absent" ? "danger" : "neutral"}>{t.answers[x.response as keyof JourneyCopy["answers"]] ?? x.response}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.noCallUp}</p>
        )}
      </Card>
      <Card title={t.publishedLineup}>
        {data.lineup ? (
          <ul className="records">
            {data.lineup.map((x) => (
              <li key={x.profile_id}>
                {x.jersey_number ?? "…"} · {x.full_name} {x.starter && <Badge>{t.starter}</Badge>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.lineupSoon}</p>
        )}
      </Card>
      {data.result && (
        <Card title={t.result}>
          <p className="journey-score">
            {data.match.team} {data.result.ours} - {data.result.theirs} {data.match.opponent}
          </p>
        </Card>
      )}
    </div>
  );
}

function BeforeStep({ ctx }: { ctx: Ctx }) {
  const { t, locale, data, busy, send } = ctx;
  const m = data.match;
  const inLineup = new Map(data.lineup.map((x) => [x.profile_id, x]));
  const [picked, setPicked] = useState<Record<string, { starter: boolean; jersey: string }>>(() =>
    Object.fromEntries(data.lineup.map((x) => [x.profile_id, { starter: x.starter, jersey: x.jersey_number === null ? "" : String(x.jersey_number) }])),
  );
  const [owners, setOwners] = useState<Record<string, string>>({});
  const counts = data.players.reduce<Record<string, number>>((n, p) => ((n[p.answer ?? "none"] = (n[p.answer ?? "none"] ?? 0) + 1), n), {});
  const canPlay = (p: Managed["players"][number]) => !p.blocking.length && (!m.calendar_event_id || p.answer === "present");
  const people = [...data.staff.map((x) => ({ id: x.id, name: x.full_name })), ...data.players.map((x) => ({ id: x.profile_id, name: x.full_name }))];
  const done = new Set(data.tasks.map((x) => x.source_kind));
  return (
    <div className="journey-step">
      <Card title={t.callUp} subtitle={t.callUpIntro} id="journey-callup">
        {m.calendar_event_id ? (
          <p className="journey-counts">
            {(["present", "uncertain", "absent", "none"] as const).map((k) => (
              <Badge key={k} tone={k === "present" ? "success" : k === "absent" ? "danger" : "neutral"}>
                {t.answers[k]} : {counts[k] ?? 0}
              </Badge>
            ))}
          </p>
        ) : (
          <>
            <p className="muted">{t.noCallUp}</p>
            <Button disabled={busy} onClick={() => void send({ action: "convene" }, t.convened)}>
              {t.convene}
            </Button>
          </>
        )}
      </Card>

      <Card title={t.lineup} subtitle={t.lineupIntro} id="journey-lineup">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(
              {
                action: "lineup",
                players: Object.entries(picked).map(([profileId, v]) => ({ profileId, starter: v.starter, position: inLineup.get(profileId)?.position ?? "", jerseyNumber: v.jersey === "" ? null : Number(v.jersey) })),
              },
              t.lineupSaved,
            );
          }}
        >
          <ul className="journey-players">
            {data.players.map((p) => {
              const ok = canPlay(p),
                v = picked[p.profile_id];
              return (
                <li key={p.profile_id} data-blocked={!ok || undefined}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!!v}
                      disabled={!ok && !v}
                      onChange={(e) =>
                        setPicked((all) => {
                          const next = { ...all };
                          if (e.target.checked) next[p.profile_id] = { starter: false, jersey: p.jersey_number === null ? "" : String(p.jersey_number) };
                          else delete next[p.profile_id];
                          return next;
                        })
                      }
                    />
                    <strong>{p.full_name}</strong>
                  </label>
                  <span className="journey-badges">
                    {p.answer && <Badge tone={p.answer === "present" ? "success" : p.answer === "absent" ? "danger" : "neutral"}>{t.answers[p.answer]}</Badge>}
                    {p.blocking.map((b) => (
                      <Badge key={b} tone="danger" dot>
                        {t.blocking} : {t.problems[b]}
                      </Badge>
                    ))}
                    {p.warnings.map((w) => (
                      <Badge key={w} tone="warning" dot>
                        {t.warning} : {t.problems[w]}
                      </Badge>
                    ))}
                    {m.calendar_event_id && p.answer !== "present" && !p.blocking.length && <span className="muted small">{t.notPresent}</span>}
                  </span>
                  {v && (
                    <span className="journey-line">
                      <label className="check">
                        <input type="checkbox" checked={v.starter} onChange={(e) => setPicked((all) => ({ ...all, [p.profile_id]: { ...v, starter: e.target.checked } }))} />
                        {t.starter}
                      </label>
                      <label htmlFor={`journey-jersey-${p.profile_id}`}>
                        {t.number}
                        <input
                          id={`journey-jersey-${p.profile_id}`}
                          className="narrow"
                          inputMode="numeric"
                          pattern="[0-9]{1,2}"
                          value={v.jersey}
                          onChange={(e) => setPicked((all) => ({ ...all, [p.profile_id]: { ...v, jersey: e.target.value.replace(/\D/g, "").slice(0, 2) } }))}
                        />
                      </label>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="actions">
            <Button disabled={busy}>{t.saveLineup}</Button>
            {data.lineup.length > 0 && (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void send({ action: "publish", published: !m.lineup_published_at }, m.lineup_published_at ? t.notPublished : t.published)}>
                {m.lineup_published_at ? t.unpublish : t.publish}
              </Button>
            )}
          </p>
          <p className="muted small">{m.lineup_published_at ? t.published : t.notPublished}</p>
        </form>
      </Card>

      <Card title={t.trip} id="journey-trip">
        {data.trip ? (
          <Link href={`/${locale}/trips?trip=${data.trip.id}`}>{data.trip.title}</Link>
        ) : (
          <>
            <p className="muted">{t.noTrip}</p>
            <Link className="button secondary" href={`/${locale}/trips`}>
              {t.planTrip}
            </Link>
          </>
        )}
      </Card>

      <Card title={t.checklist} subtitle={t.checklistIntro} id="journey-checklist">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const items = (["chairs", "batteries", "balls", "shirts", "firstAid", "transport"] as const).filter((k) => !done.has(`match_${k}`)).map((key) => ({ key, responsibleId: owners[key] || null }));
            void send({ action: "checklist", items }, (o) => fill(t.checklistSent, { n: Number(o.created ?? 0) }));
          }}
        >
          <ul className="journey-checklist">
            {(["chairs", "batteries", "balls", "shirts", "firstAid", "transport"] as const).map((k) => (
              <li key={k}>
                <span>{t.items[k]}</span>
                {done.has(`match_${k}`) ? (
                  <Badge tone="success">{data.tasks.find((x) => x.source_kind === `match_${k}`)?.responsible || "✓"}</Badge>
                ) : (
                  <label htmlFor={`journey-owner-${k}`}>
                    <span className="sr-only">
                      {t.responsible} : {t.items[k]}
                    </span>
                    <select id={`journey-owner-${k}`} value={owners[k] ?? ""} onChange={(e) => setOwners((o) => ({ ...o, [k]: e.target.value }))}>
                      <option value="">{t.nobody}</option>
                      {people.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </li>
            ))}
          </ul>
          {done.size < 6 && (
            <p>
              <Button disabled={busy}>{t.sendChecklist}</Button>
            </p>
          )}
        </form>
        {data.tasks.length > 0 && (
          <p>
            <Link href={`/${locale}/tasks`}>{t.tasks} →</Link>
          </p>
        )}
      </Card>
    </div>
  );
}

/** The facts still waiting on this phone for this match, shown like the others. */
function waitingOf(data: Managed): Live[] {
  return pendingLive(data.match.id).map((q) => ({
    id: String(q.body.clientId),
    client_id: String(q.body.clientId),
    kind: String(q.body.kind),
    profile_id: (q.body.profileId as string | null) ?? null,
    name: data.lineup.find((x) => x.profile_id === q.body.profileId)?.full_name ?? "",
    minute: (q.body.minute as number | null) ?? null,
    created_at: new Date(q.queuedAt).toISOString(),
    cancelled_at: null,
  }));
}

function DayStep({ ctx }: { ctx: Ctx }) {
  const { t, locale, data, reload } = ctx;
  const [minute, setMinute] = useState(""),
    [waiting, setWaiting] = useState<Live[]>(() => waitingOf(data)),
    [note, setNote] = useState("");
  const post = useCallback(
    (body: Record<string, unknown>) => fetch("/api/matches/journey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: data.organization_id }) }),
    [data.organization_id],
  );
  // Back online: what waited on the phone leaves, in order.
  useEffect(() => {
    const sync = () =>
      void flushLive(post).then((r) => {
        if (r.sent || r.refused) {
          setWaiting(waitingOf(data));
          setNote(fill(t.synced, { n: r.sent }));
          void reload();
        }
      });
    window.addEventListener("online", sync);
    if (navigator.onLine && pendingLive(data.match.id).length) sync();
    return () => window.removeEventListener("online", sync);
  }, [post, reload, data, t.synced]);
  const events = [...data.live.filter((e) => !waiting.some((w) => w.client_id === e.client_id)), ...waiting];
  const live = events.filter((e) => !e.cancelled_at);
  const ours = live.filter((e) => e.kind === "goal").length,
    theirs = live.filter((e) => e.kind === "goal_against").length;
  async function record(kind: string, profileId: string | null) {
    const clientId = crypto.randomUUID();
    const body = { action: "live", id: data.match.id, clientId, kind, profileId, minute: minute === "" ? null : Number(minute) };
    try {
      if (!navigator.onLine) throw new TypeError("offline");
      const r = await post(body);
      if (!r.ok) throw new Error((await r.json()).error);
      setNote("");
      await reload();
    } catch (e) {
      if (!(e instanceof TypeError)) {
        setNote(t.errors[(e as Error).message] ?? (e as Error).message);
        return;
      }
      // No network: the fact waits on the phone and shows at once.
      queueLive(clientId, body);
      setWaiting((w) => [
        ...w,
        { id: clientId, client_id: clientId, kind, profile_id: profileId, name: data.lineup.find((x) => x.profile_id === profileId)?.full_name ?? "", minute: body.minute, created_at: new Date().toISOString(), cancelled_at: null },
      ]);
      setNote(t.queued);
    }
  }
  if (!data.lineup.length) return <EmptyState title={t.noLineup} />;
  return (
    <div className="journey-step journey-day">
      <p className="journey-score" aria-live="polite">
        {data.match.team} {ours} - {theirs} {data.match.opponent}
      </p>
      {waiting.length > 0 && <p className="notice">{fill(t.offline, { n: waiting.length })}</p>}
      {/* Guide, Le fauteuil de match: the speed is checked at least 15 minutes before kick-off. */}
      <p className="notice">
        {t.speedReminder} <Link href={`/${locale}/guide/chair`}>{t.guideChair}</Link>
      </p>
      <p role="status">{note}</p>
      <div className="journey-day-tools">
        <label htmlFor="journey-minute">
          {t.minute}
          <input id="journey-minute" className="narrow" inputMode="numeric" pattern="[0-9]{1,3}" value={minute} onChange={(e) => setMinute(e.target.value.replace(/\D/g, "").slice(0, 3))} />
        </label>
        <button type="button" className="button danger journey-big" onClick={() => void record("goal_against", null)}>
          {t.goalAgainst}
        </button>
        {data.match.calendar_event_id && (
          <Link className="button secondary journey-big" href={`/${locale}/attendance`}>
            {t.presences}
          </Link>
        )}
      </div>
      <ul className="journey-day-players">
        {data.lineup.map((p) => (
          <li key={p.profile_id}>
            <strong>
              {p.jersey_number ?? "…"} · {p.full_name}
            </strong>
            <span className="journey-day-buttons">
              <button type="button" className="button journey-big" aria-label={fill(t.goalOf, { name: p.full_name })} onClick={() => void record("goal", p.profile_id)}>
                {t.goal}
              </button>
              <button type="button" className="button secondary journey-big" aria-label={fill(t.yellowOf, { name: p.full_name })} onClick={() => void record("yellow", p.profile_id)}>
                {t.yellow}
              </button>
              <button type="button" className="button secondary journey-big" aria-label={fill(t.redOf, { name: p.full_name })} onClick={() => void record("red", p.profile_id)}>
                {t.red}
              </button>
              <button type="button" className="button secondary journey-big" aria-label={fill(t.subInOf, { name: p.full_name })} onClick={() => void record("sub_in", p.profile_id)}>
                {t.subIn}
              </button>
              <button type="button" className="button secondary journey-big" aria-label={fill(t.subOutOf, { name: p.full_name })} onClick={() => void record("sub_out", p.profile_id)}>
                {t.subOut}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {events.length > 0 && (
        <ol className="journey-events">
          {events.map((e) => {
            const what = `${e.minute !== null ? `${e.minute}' ` : ""}${t.live[e.kind as keyof JourneyCopy["live"]] ?? e.kind}${e.name ? ` · ${e.name}` : ""}`;
            return (
              <li key={e.client_id} data-cancelled={e.cancelled_at ? true : undefined}>
                <span>{what}</span>
                {!e.cancelled_at && !waiting.some((w) => w.client_id === e.client_id) && (
                  <Button size="sm" variant="secondary" aria-label={fill(t.undoOf, { what })} onClick={() => void ctx.send({ action: "undoLive", eventId: e.id }, "")}>
                    {t.undo}
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function AfterStep({ ctx }: { ctx: Ctx }) {
  const { t, locale, data, busy, send } = ctx;
  const m = data.match;
  const [ours, setOurs] = useState(String(m.our_score ?? data.liveScore.ours)),
    [theirs, setTheirs] = useState(String(m.their_score ?? data.liveScore.theirs)),
    [announcement, setAnnouncement] = useState<string | null>(data.announcement);
  const day = (iso: string) => new Intl.DateTimeFormat(tag(locale), { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(iso));
  return (
    <div className="journey-step">
      <Card title={t.result} subtitle={t.afterIntro} id="journey-result">
        {m.validated_at ? (
          <p>
            <strong className="journey-score">
              {m.team} {m.our_score} - {m.their_score} {m.opponent}
            </strong>
            <br />
            <span className="muted">{fill(t.validatedOn, { date: day(m.validated_at) })}</span>
          </p>
        ) : (
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              void send({ action: "validate", version: m.version, ourScore: Number(ours), theirScore: Number(theirs) }, t.validated).then((o) => o?.announcement && setAnnouncement(String(o.announcement)));
            }}
          >
            <label htmlFor="journey-ours">
              {t.ourScore}
              <input id="journey-ours" inputMode="numeric" pattern="[0-9]{1,2}" required value={ours} onChange={(e) => setOurs(e.target.value.replace(/\D/g, "").slice(0, 2))} />
            </label>
            <label htmlFor="journey-theirs">
              {t.theirScore}
              <input id="journey-theirs" inputMode="numeric" pattern="[0-9]{1,2}" required value={theirs} onChange={(e) => setTheirs(e.target.value.replace(/\D/g, "").slice(0, 2))} />
            </label>
            {ctx.error && <p role="alert">{ctx.error}</p>}
            <p>
              <Button disabled={busy}>{t.validate}</Button>
            </p>
          </form>
        )}
        <p className="actions">
          <a className="button secondary" href={`/api/matches/journey/sheet?id=${m.id}`} target="_blank" rel="noopener">
            {t.sheet}
          </a>
          {announcement && (
            <Link className="button secondary" href={`/${locale}/communication`}>
              {t.announcement}
            </Link>
          )}
        </p>
        {announcement && <p className="muted small">{t.announcementReady}</p>}
      </Card>
      <Card title={t.referees} id="journey-referees">
        {data.referees.length ? (
          <ul className="records">
            {data.referees.map((r, i) => (
              <li key={i}>{r.name}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.noReferee}</p>
        )}
        <ReportReview locale={locale} matchId={data.match.id} />
      </Card>
    </div>
  );
}
