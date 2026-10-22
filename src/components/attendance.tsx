"use client";
import { AbsencesPanel, absenceCopy } from "./absences";
import { AttendanceCall, AttendanceStats, queueOffline, useSeasonAttendance } from "./attendance-call";
import { callCopy } from "./attendance-call-copy";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { useScopedTeam, ApplyScope } from "./use-scope";
import { Button, ExportButton, Panel, PageHeader, Tabs } from "./ui";
import { attendanceCopy } from "./attendance-copy";
import { AttendanceGrid, gridCopy } from "./attendance-grid";
import { actuals, responses } from "@/domains/attendance/schema";
import { localAt, shiftLocal, toInstant } from "@/domains/calendar/time";
import type { attendanceView } from "@/domains/attendance/service";
import {
  flushMarks,
  loadSnapshot,
  pendingMarks,
  queueMark,
  saveSnapshot,
} from "@/lib/offline-queue";
type View = Awaited<ReturnType<typeof attendanceView>>;
const offlineCopy = {
  fr: {
    queued: "Hors ligne : pointage gardé sur cet appareil, il sera envoyé au retour du réseau.",
    pending: "{n} pointage(s) en attente d'envoi.",
    synced: "Réseau retrouvé : {sent} pointage(s) envoyé(s), {refused} refusé(s) car le registre a changé.",
    snapshot: "Hors ligne : données du {date}. Les pointages seront envoyés au retour du réseau.",
  },
  nl: {
    queued: "Offline: aanwezigheid op dit toestel bewaard, ze wordt verstuurd zodra er weer netwerk is.",
    pending: "{n} aanwezigheid/aanwezigheden wachten op verzending.",
    synced: "Netwerk terug: {sent} verstuurd, {refused} geweigerd omdat het register veranderde.",
    snapshot: "Offline: gegevens van {date}. De aanwezigheden worden verstuurd zodra er weer netwerk is.",
  },
  en: {
    queued: "Offline: attendance kept on this device, it will be sent when the network is back.",
    pending: "{n} mark(s) waiting to be sent.",
    synced: "Network back: {sent} mark(s) sent, {refused} refused because the register changed.",
    snapshot: "Offline: data from {date}. Marks will be sent when the network is back.",
  },
};
/** « Saison »: the period, the grid (one column per session) and the session opened below it. */
function SeasonView({ locale }: { locale: Locale }) {
  const t = attendanceCopy[locale],
    today = localAt(new Date(), "Europe/Brussels");
  const { team, setTeam, differs: teamDiffers, apply: applyTeam } = useScopedTeam();
  const [from, setFrom] = useState(shiftLocal(today, -30).slice(0, 10)),
    [to, setTo] = useState(shiftLocal(today, 60).slice(0, 10)),
    [data, setData] = useState<View | null>(null),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [revision, setRevision] = useState(0),
    [pending, setPending] = useState(0),
    [offlineView, setOfflineView] = useState<number | null>(null);
  const explain = useCallback(
    (code: string) => t.errors[code as keyof typeof t.errors] ?? t.error,
    [t],
  );
  useEffect(() => {
    const abort = new AbortController();
    queueMicrotask(() => {
      if (!abort.signal.aborted) setLoading(true);
    });
    fetch(
      "/api/attendance?" + new URLSearchParams({ from, to, team, place: "" }),
      { signal: abort.signal },
    )
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        setData(body);
        setError("");
        setOfflineView(null);
        // Kept 24 hours on this device to take attendance without network.
        saveSnapshot([from, to, team].join("|"), body);
      })
      .catch((e) => {
        if (abort.signal.aborted) return;
        const snapshot =
          e instanceof TypeError
            ? loadSnapshot<View>([from, to, team].join("|"))
            : null;
        if (snapshot) {
          setData(snapshot.data);
          setOfflineView(snapshot.savedAt);
          setError("");
        } else {
          setData(null);
          setError(e instanceof TypeError ? t.offline : explain(e.message));
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
    // t.offline is static copy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, team, revision, explain]);
  // Marks taken offline are sent as soon as the connection comes back.
  useEffect(() => {
    const flush = () =>
      flushMarks((body) =>
        fetch("/api/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      ).then((result) => {
        setPending(result.left);
        if (result.sent || result.refused) {
          setRevision((v) => v + 1);
          setMessage(
            offlineCopy[locale].synced
              .replace("{sent}", String(result.sent))
              .replace("{refused}", String(result.refused)),
          );
        }
      });
    queueMicrotask(() => setPending(pendingMarks().length));
    if (navigator.onLine) void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [locale]);
  /** Offline mark: kept on the device and shown at once. */
  function markOffline(body: Record<string, unknown>) {
    if (!data) return;
    const id = String(body.id);
    setPending(queueMark(id, { ...body, organizationId: data.context.organization_id }));
    setData({
      ...data,
      events: data.events.map((ev) => ({
        ...ev,
        invitations: ev.invitations.map((i) =>
          i.id === id ? { ...i, actual: String(body.actual) } : i,
        ),
      })),
    } as View);
    setMessage(offlineCopy[locale].queued);
  }
  async function command(body: Record<string, unknown>) {
    if (!data || busy) return;
    if (body.action === "mark" && !navigator.onLine) return markOffline(body);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          organizationId: data.context.organization_id,
        }),
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error);
      setRevision((v) => v + 1);
      setMessage(t.saved);
    } catch (e) {
      if (e instanceof TypeError && body.action === "mark") markOffline(body);
      else
        setError(
          e instanceof TypeError
            ? t.offline
            : explain(e instanceof Error ? e.message : ""),
        );
    } finally {
      setBusy(false);
    }
  }
  function form(
    e: FormEvent<HTMLFormElement>,
    fn: (f: FormData) => Record<string, unknown>,
  ) {
    e.preventDefault();
    try {
      void command(fn(new FormData(e.currentTarget)));
    } catch {
      setError(t.errors.INVALID_INPUT);
    }
  }
  const e = data?.events.find((e) => e.id === selected),
    r = e?.register;
  const date = (value: string | Date) =>
    new Date(value).toLocaleString(
      locale === "en" ? "en-GB" : locale === "fr" ? "fr-BE" : "nl-BE",
      {
        timeZone: "Europe/Brussels",
        dateStyle: "medium",
        timeStyle: "short",
      },
    );
  return (
    <>
        {error && (
          <p role="alert">
            {error} <Link href={`/${locale}/access`}>{t.access}</Link>
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {offlineView && (
          <p className="notice">
            {offlineCopy[locale].snapshot.replace(
              "{date}",
              new Date(offlineView).toLocaleString(
                locale === "en" ? "en-GB" : `${locale}-BE`,
                { timeZone: "Europe/Brussels" },
              ),
            )}
          </p>
        )}
        {pending > 0 && (
          <p className="notice">
            {offlineCopy[locale].pending.replace("{n}", String(pending))}
          </p>
        )}
        <Panel title={t.calendar}>
          <div className="form-grid">
            <label>
              {t.from}
              <input
                type="date"
                min="2000-01-01"
                max="2099-12-31"
                value={from}
                onChange={(v) => setFrom(v.target.value)}
              />
            </label>
            <label>
              {t.to}
              <input
                type="date"
                min="2000-01-01"
                max="2099-12-31"
                value={to}
                onChange={(v) => setTo(v.target.value)}
              />
            </label>
            <label>
              {t.team}
              <select value={team} onChange={(v) => setTeam(v.target.value)}>
                <option value="">{t.all}</option>
                {data?.teams.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <ApplyScope locale={locale} differs={teamDiffers} apply={applyTeam} />
            </label>
            <label>
              {t.season}
              <select
                value=""
                onChange={(v) => {
                  const s = data?.seasons.find((s) => s.id === v.target.value);
                  if (s) {
                    setFrom(s.starts_on);
                    setTo(s.ends_on);
                  }
                }}
              >
                <option value="">{t.custom}</option>
                {data?.seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button disabled={busy} onClick={() => setRevision((v) => v + 1)}>
            {t.load}
          </Button>
          {loading ? (
            <p role="status">{t.loading}</p>
          ) : !data?.events.length ? (
            <p>{t.empty}</p>
          ) : (
            <>
              <p className="muted small">{gridCopy[locale].intro}</p>
              {/* Wave 17 (G2): the grid as shown, a column per session. */}
              <ExportButton
                locale={locale}
                organizationId={data.context.organization_id}
                dataset="attendanceSeason"
                subject={callCopy[locale].season}
                period={`${from} ${to}`}
                rows={[...new Map(data.events.flatMap((v) => v.invitations.filter((i) => !i.withdrawn_at).map((i) => [i.profile_id, i.full_name] as const))).entries()].sort((x, y) => x[1].localeCompare(y[1]))}
                columns={[
                  { id: "name", label: callCopy[locale].cols.name, value: ([, name]) => name },
                  ...data.events
                    .filter((v) => v.status !== "cancelled" && v.register)
                    .map((v) => ({
                      id: v.id,
                      label: `${String(v.starts_at).slice(0, 10)} ${v.title}`.slice(0, 80),
                      value: ([pid]: readonly [string, string]) => {
                        const i = v.invitations.find((x) => x.profile_id === pid && !x.withdrawn_at);
                        return i ? (t.actuals[i.actual as keyof typeof t.actuals] ?? i.actual) : null;
                      },
                    })),
                ].slice(0, 40)}
              />
              <AttendanceGrid
                locale={locale}
                events={data.events}
                selected={selected}
                busy={busy}
                onSelect={(id) => {
                  setSelected(id);
                  setMessage("");
                  setTimeout(
                    () => document.getElementById("attendance-event")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                    0,
                  );
                }}
                onMark={(id, version, actual, closed) =>
                  void command({
                    action: "mark",
                    id,
                    expectedVersion: version,
                    actual,
                    // A closed register needs a reason: the quick grid writes a standard one.
                    reason: closed ? t.correction : "",
                  })
                }
              />
              <details className="muted small">
                <summary>{gridCopy[locale].legend}</summary>
                <p>
                  {(["present", "absent", "late", "early", "unchecked"] as const)
                    .map((k) => `${gridCopy[locale].short[k]} = ${gridCopy[locale].actuals[k]}`)
                    .join(" · ")}
                  {" · "}
                  {(["present", "absent", "uncertain", "none"] as const)
                    .map((k) => `${gridCopy[locale].answer[k]} = ${gridCopy[locale].responses[k]}`)
                    .join(" · ")}
                </p>
              </details>
              <ul className="plain-list grid-missing">
                {data.events
                  .filter((v) => v.manage && !v.register && v.status === "scheduled")
                  .map((v) => (
                    <li key={v.id}>
                      <button type="button" className="text-button" onClick={() => { setSelected(v.id); setMessage(""); }}>
                        {v.title} · {date(v.starts_at)} · {t.noRegister}
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </Panel>
        {e && (
          <div id="attendance-event">
          <Panel title={e.title}>
            <p>
              {date(e.starts_at)} — {date(e.ends_at)}
            </p>
            {e.status === "cancelled" && <p>{t.cancelled}</p>}
            {r && (
              <p>
                {r.closed_at ? t.closed : t.pending} · {t.deadline} :{" "}
                {date(r.deadline)} · {t.minimum} : {r.minimum}
              </p>
            )}
            {e.manage &&
              e.status === "scheduled" &&
              !r?.closed_at &&
              new Date(e.starts_at) > new Date() && (
                <form
                  key={e.id + ":" + (r?.version ?? 0)}
                  onSubmit={(v) =>
                    form(v, (f) => ({
                      action: "invite",
                      eventId: e.id,
                      expectedVersion: r?.version ?? null,
                      profiles: f.getAll("profile"),
                      deadline: toInstant(
                        String(f.get("deadline")),
                        "Europe/Brussels",
                        "reject",
                      ).toISOString(),
                      minimum: Number(f.get("minimum")),
                    }))
                  }
                >
                  <fieldset disabled={busy}>
                    <legend>{t.candidates}</legend>
                    {!e.candidates.length && <p>{t.nocandidates}</p>}
                    {e.candidates.map((p) => (
                      <label className="check" key={p.id}>
                        <input
                          type="checkbox"
                          name="profile"
                          value={p.id}
                          defaultChecked={
                            r
                              ? e.invitations.some(
                                  (i) =>
                                    i.profile_id === p.id && !i.withdrawn_at,
                                )
                              : true
                          }
                        />
                        {p.full_name}
                      </label>
                    ))}
                  </fieldset>
                  <label>
                    {t.deadline}
                    <input
                      name="deadline"
                      type="datetime-local"
                      required
                      defaultValue={localAt(
                        new Date(
                          r?.deadline ??
                            new Date(
                              new Date(e.starts_at).getTime() - 86400000,
                            ),
                        ),
                        "Europe/Brussels",
                      )}
                    />
                  </label>
                  <label>
                    {t.minimum}
                    <input
                      name="minimum"
                      type="number"
                      min="0"
                      max="300"
                      defaultValue={r?.minimum ?? 0}
                      required
                    />
                  </label>
                  <Button disabled={busy || !e.candidates.length}>
                    {t.invite}
                  </Button>
                </form>
              )}
            <p>{t.notice}</p>
            {e.invitations.map((i) => (
              <section
                className="attendance-person"
                key={i.id + ":" + i.version}
              >
                <h3>
                  {i.full_name}
                  {i.withdrawn_at ? " · " + t.withdrawn : ""}
                </h3>
                <p>
                  {t.response} :{" "}
                  {t.responses[i.response as keyof typeof t.responses]} ·{" "}
                  {t.actual} : {t.actuals[i.actual as keyof typeof t.actuals]}
                </p>
                {i.response === "absent" && i.absence_reason && (
                  <p className="muted small">
                    {absenceCopy[locale].reason} : {(absenceCopy[locale].reasons as Record<string, string>)[i.absence_reason]}
                  </p>
                )}
                {i.comment && <p>{i.comment}</p>}
                {i.canRespond &&
                  r &&
                  !r.closed_at &&
                  e.status === "scheduled" &&
                  new Date(r.deadline) > new Date() &&
                  new Date(e.starts_at) > new Date() && (
                    <form
                      onSubmit={(v) =>
                        form(v, (f) => ({
                          action: "respond",
                          id: i.id,
                          expectedVersion: i.version,
                          response: f.get("response"),
                          comment: f.get("comment"),
                          ...(f.get("response") === "absent"
                            ? { absenceReason: f.get("absenceReason") || "other" }
                            : {}),
                        }))
                      }
                    >
                      <label>
                        {t.response}
                        <select
                          aria-label={t.response}
                          name="response"
                          defaultValue={i.response}
                        >
                          {responses.map((v) => (
                            <option key={v} value={v}>
                              {t.responses[v]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {absenceCopy[locale].ifAbsent}
                        <select
                          name="absenceReason"
                          defaultValue={i.absence_reason || "illness"}
                        >
                          {Object.entries(absenceCopy[locale].reasons).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t.comment}
                        <textarea
                          name="comment"
                          maxLength={1000}
                          defaultValue={i.comment}
                        />
                      </label>
                      <Button disabled={busy}>{t.respond}</Button>
                    </form>
                  )}
                {e.manage &&
                  !i.withdrawn_at &&
                  e.status === "scheduled" &&
                  new Date(e.starts_at) <= new Date() && (
                    <form
                      onSubmit={(v) =>
                        form(v, (f) => ({
                          action: "mark",
                          id: i.id,
                          expectedVersion: i.version,
                          actual: f.get("actual"),
                          reason: f.get("reason"),
                        }))
                      }
                    >
                      <label>
                        {t.actual}
                        <select
                          aria-label={t.actual}
                          name="actual"
                          defaultValue={i.actual}
                        >
                          {actuals.map((v) => (
                            <option key={v} value={v}>
                              {t.actuals[v]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t.reason}
                        <textarea
                          name="reason"
                          maxLength={1000}
                          required={!!r?.closed_at}
                        />
                      </label>
                      <Button disabled={busy}>{t.mark}</Button>
                    </form>
                  )}
              </section>
            ))}
            {e.manage && r && !r.closed_at && e.status === "scheduled" && (
              <>
                <p>{t.closeHint}</p>
                {new Date(r.deadline) > new Date() &&
                  new Date(e.starts_at) > new Date() && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void command({
                          action: "remind",
                          id: r.id,
                          expectedVersion: r.version,
                        })
                      }
                    >
                      {t.remind}
                    </Button>
                  )}
                {new Date(e.starts_at) <= new Date() && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void command({
                        action: "close",
                        id: r.id,
                        expectedVersion: r.version,
                      })
                    }
                  >
                    {t.close}
                  </Button>
                )}
              </>
            )}
            <h3>{t.history}</h3>
            <ol>
              {e.history.map((h) => (
                <li key={h.id}>
                  {date(h.created_at)} ·{" "}
                  {t.actions[h.action as keyof typeof t.actions] ?? h.action} ·{" "}
                  {h.actor}
                  {h.reason ? " · " + h.reason : ""}
                  {h.action === "respond" && (
                    <p>
                      {
                        t.responses[
                          String(
                            h.before_data?.response ?? "none",
                          ) as keyof typeof t.responses
                        ]
                      }{" "}
                      →{" "}
                      {
                        t.responses[
                          String(
                            h.after_data?.response ?? "none",
                          ) as keyof typeof t.responses
                        ]
                      }
                    </p>
                  )}
                  {h.action === "mark" && (
                    <p>
                      {
                        t.actuals[
                          String(
                            h.before_data?.actual ?? "unchecked",
                          ) as keyof typeof t.actuals
                        ]
                      }{" "}
                      →{" "}
                      {
                        t.actuals[
                          String(
                            h.after_data?.actual ?? "unchecked",
                          ) as keyof typeof t.actuals
                        ]
                      }
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </Panel>
          </div>
        )}
    </>
  );
}

/**
 * Wave 17 (J2): the attendance page in three tabs. « Appel » (default for
 * those who take the roll) shows one session at a time; « Saison » keeps the
 * grid with a column per session; « Statistiques » has a card per player.
 * Closing, traced corrections, coaches' rights and offline marks are kept.
 */
export function Attendance({ locale }: { locale: Locale }) {
  const t = attendanceCopy[locale],
    c = callCopy[locale];
  const [revision, setRevision] = useState(0),
    [tab, setTab] = useState<"call" | "season" | "stats" | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const season = useSeasonAttendance(revision);
  const data = season.data;
  const caller = !!data && (data.events.some((e) => e.manage) || ["club_president", "coach"].includes(data.context.role));
  const current = tab ?? (caller ? "call" : "season");
  const explain = (code: string) => t.errors[code as keyof typeof t.errors] ?? t.error;
  async function send(body: Record<string, unknown>) {
    if (!data) return null;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: data.context.organization_id }) });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error);
      setRevision((v) => v + 1);
      return out as { undo?: string; count?: number };
    } catch (e) {
      if (e instanceof TypeError && body.action === "mark") offline(body);
      else setError(e instanceof TypeError ? t.offline : explain(e instanceof Error ? e.message : ""));
      return null;
    } finally {
      setBusy(false);
    }
  }
  /** Without network, a mark waits on the device and shows at once. */
  function offline(body: Record<string, unknown>) {
    if (!data) return;
    queueOffline(data, body);
    season.setData({
      ...data,
      events: data.events.map((ev) => ({ ...ev, invitations: ev.invitations.map((i) => (i.id === body.id ? { ...i, actual: String(body.actual) } : i)) })),
    } as typeof data);
    setError(offlineCopy[locale].queued);
  }
  const items = [...(caller ? [{ id: "call", label: c.call }] : []), { id: "season", label: c.season }, { id: "stats", label: c.stats }];
  return (
    <main id="main" className="access attendance">
      <PageHeader title={t.title} subtitle={t.intro} />
      <Tabs label={c.tabs} items={items} value={current} onChange={(v) => setTab(v as "call" | "season" | "stats")} idPrefix="attendance-tab" panelId={(v) => `attendance-panel-${v}`} />
      <div role="tabpanel" id={`attendance-panel-${current}`} aria-labelledby={`attendance-tab-${current}`} className="attendance-panel">
        {current !== "season" && error && <p role="alert">{error}</p>}
        {current === "season" ? (
          <SeasonView locale={locale} />
        ) : !data ? (
          <p role="status">{season.error ? explain(season.error) : c.loading}</p>
        ) : current === "call" ? (
          <AttendanceCall locale={locale} data={data} team={season.team} send={send} reload={() => setRevision((v) => v + 1)} busy={busy || season.loading} onOffline={offline} />
        ) : (
          <AttendanceStats locale={locale} data={data} team={season.team} seasonName={season.season?.name ?? null} />
        )}
      </div>
      <AbsencesPanel locale={locale} />
    </main>
  );
}
