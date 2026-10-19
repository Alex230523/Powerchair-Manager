"use client";
import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type {
  refereeView,
  designationsView,
} from "@/domains/competitions/service";
import { refereesCopy, weekendDays } from "./referees-copy";
import { errors } from "./access-copy";

const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const when = (l: Locale, d: string) =>
  new Intl.DateTimeFormat(tag(l), {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Brussels",
  }).format(new Date(d));
type Score = {
  home_score: number;
  away_score: number;
  incidents: string;
} | null;
const label = (m: {
  club: string;
  team: string;
  opponent: string;
  home: boolean;
}) =>
  m.home
    ? `${m.club} (${m.team}) · ${m.opponent}`
    : `${m.opponent} · ${m.club} (${m.team})`;

/** Shared loader: first fetch inline in the effect, reload after each command. */
function useResource<T>(
  url: string,
  deniedCodes: string[],
  failure: (c: string) => string,
) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [denied, setDenied] = useState(false);
  const reload = useCallback(async () => {
    const r = await fetch(url, { cache: "no-store" });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setData(v);
  }, [url]);
  useEffect(() => {
    let cancelled = false;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!cancelled) setData(v);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        if (deniedCodes.includes(e.message)) setDenied(true);
        else setError(failure(e.message));
      });
    return () => {
      cancelled = true;
    };
    // deniedCodes is a constant list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, failure]);
  return { data, error, setError, denied, reload };
}
const deniedCodes = [
  "FORBIDDEN",
  "FEDERATION_ONLY",
  "CONTEXT_REQUIRED",
  "MFA_REQUIRED",
];

export function RefereeSpace({ locale }: { locale: Locale }) {
  const t = refereesCopy[locale];
  const failure = useCallback(
    (code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable,
    [t, locale],
  );
  const { data, error, setError, denied, reload } = useResource<
    Awaited<ReturnType<typeof refereeView>>
  >("/api/referee", deniedCodes, failure);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/referee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          organizationId: data?.organization_id,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await reload();
      setMessage(done);
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }
  const days = data ? weekendDays(data.today) : [];
  const dayLabel = (d: string) =>
    new Intl.DateTimeFormat(tag(locale), {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(d + "T12:00:00Z"));

  return (
    <main id="main" className="access referees">
      <h1>{t.refereeTitle}</h1>
      <p className="muted">{t.refereeIntro}</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {denied && <p className="notice">{t.denied}</p>}
      {!data && !denied && !error && <p role="status">{t.loading}</p>}
      {data && (
        <div className="grid">
          <section className="panel" aria-labelledby="ref-assignments">
            <h2 id="ref-assignments">{t.assignments}</h2>
            {data.assignments.length ? (
              <ul className="records">
                {data.assignments.map((a) => {
                  const report = a.report as Score;
                  const past = new Date(a.starts_at) <= new Date();
                  return (
                    <li key={a.match_id}>
                      <strong>{label(a)}</strong>
                      <span className="muted">
                        {" "}
                        · {when(locale, a.starts_at)} · {t.kinds[a.kind]}
                        {a.competition ? ` · ${a.competition}` : ""}
                        {a.venue ? ` · ${a.venue}` : ""} · {t.roles[a.role]}
                      </span>
                      <span
                        className="status-tag"
                        data-tone={
                          a.status === "accepted"
                            ? "success"
                            : a.status === "declined"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {t.statuses[a.status]}
                      </span>
                      {a.status === "proposed" && (
                        <div className="row-actions">
                          <button
                            type="button"
                            className="button"
                            disabled={busy}
                            onClick={() =>
                              void send(
                                {
                                  action: "answer",
                                  matchId: a.match_id,
                                  accept: true,
                                },
                                t.saved,
                              )
                            }
                          >
                            {t.accept}
                          </button>
                          <button
                            type="button"
                            className="button secondary"
                            disabled={busy}
                            onClick={() =>
                              void send(
                                {
                                  action: "answer",
                                  matchId: a.match_id,
                                  accept: false,
                                },
                                t.saved,
                              )
                            }
                          >
                            {t.decline}
                          </button>
                        </div>
                      )}
                      {a.status === "accepted" && past && (
                        <details className="report-details" open={!report}>
                          <summary>
                            {report
                              ? `${t.reportDone} : ${report.home_score}-${report.away_score}`
                              : t.report}
                          </summary>
                          <form
                            className="finance-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const f = new FormData(e.currentTarget);
                              void send(
                                {
                                  action: "report",
                                  matchId: a.match_id,
                                  homeScore: Number(f.get("home")),
                                  awayScore: Number(f.get("away")),
                                  incidents: String(f.get("incidents") ?? ""),
                                },
                                t.reportSent,
                              );
                            }}
                          >
                            <div className="form-pair">
                              <label htmlFor={"home-" + a.match_id}>
                                {t.homeScore}
                                <input
                                  id={"home-" + a.match_id}
                                  name="home"
                                  type="number"
                                  min={0}
                                  max={99}
                                  required
                                  defaultValue={report?.home_score ?? ""}
                                />
                              </label>
                              <label htmlFor={"away-" + a.match_id}>
                                {t.awayScore}
                                <input
                                  id={"away-" + a.match_id}
                                  name="away"
                                  type="number"
                                  min={0}
                                  max={99}
                                  required
                                  defaultValue={report?.away_score ?? ""}
                                />
                              </label>
                            </div>
                            <label htmlFor={"inc-" + a.match_id}>
                              {t.incidents}
                              <textarea
                                id={"inc-" + a.match_id}
                                name="incidents"
                                maxLength={4000}
                                defaultValue={report?.incidents ?? ""}
                              />
                            </label>
                            <button className="button" disabled={busy}>
                              {t.sendReport}
                            </button>
                          </form>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">{t.noAssignment}</p>
            )}
          </section>
          <section className="panel" aria-labelledby="ref-availability">
            <h2 id="ref-availability">{t.availability}</h2>
            <p className="muted">{t.availabilityHint}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void send(
                  {
                    action: "availability",
                    days: days.map((day) => ({
                      day,
                      available: f.has(day),
                      note: "",
                    })),
                  },
                  t.saved,
                );
              }}
            >
              <ul className="availability-grid">
                {days.map((d) => (
                  <li key={d}>
                    <label className="check">
                      <input
                        type="checkbox"
                        name={d}
                        defaultChecked={
                          !!data.availability.find(
                            (x) => x.day === d && x.available,
                          )
                        }
                      />
                      {dayLabel(d)}
                    </label>
                  </li>
                ))}
              </ul>
              <button className="button" disabled={busy}>
                {t.saveAvailability}
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export function Designations({ locale }: { locale: Locale }) {
  const t = refereesCopy[locale];
  const failure = useCallback(
    (code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable,
    [t, locale],
  );
  const { data, error, setError, denied, reload } = useResource<
    Awaited<ReturnType<typeof designationsView>>
  >("/api/designations", deniedCodes, failure);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/designations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          organizationId: data?.organization_id,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await reload();
      setMessage(t.saved);
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }
  const availabilityOf = (referee: string, day: string) =>
    data?.availability.find((a) => a.user_id === referee && a.day === day);

  return (
    <main id="main" className="access referees">
      <h1>{t.designTitle}</h1>
      <p className="muted">{t.designIntro}</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {denied && <p className="notice">{t.denied}</p>}
      {!data && !denied && !error && <p role="status">{t.loading}</p>}
      {data && (
        <>
          {!data.can.manage && <p className="notice">{t.readOnly}</p>}
          {!data.referees.length && <p className="notice">{t.noReferee}</p>}
          {data.matches.length ? (
            <ul className="records">
              {data.matches.map((m) => {
                const assigned = m.referees as {
                  referee_id: string;
                  name: string;
                  role: string;
                  status: string;
                }[];
                const report = m.report as Score;
                return (
                  <li key={m.id}>
                    <strong>{label(m)}</strong>
                    <span className="muted">
                      {" "}
                      · {when(locale, m.starts_at)} · {t.kinds[m.kind]}
                      {m.competition ? ` · ${m.competition}` : ""}
                      {m.venue ? ` · ${m.venue}` : ""}
                    </span>
                    {report && (
                      <span className="status-tag" data-tone="success">
                        {t.reportDone} {report.home_score}-{report.away_score}
                      </span>
                    )}
                    <ul className="assigned-referees">
                      {assigned.map((a) => (
                        <li key={a.referee_id}>
                          {a.name} · {t.roles[a.role]}{" "}
                          <span
                            className="status-tag"
                            data-tone={
                              a.status === "accepted"
                                ? "success"
                                : a.status === "declined"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {t.statuses[a.status]}
                          </span>
                          {data.can.manage && (
                            <button
                              type="button"
                              className="text-button"
                              disabled={busy}
                              onClick={() =>
                                void send({
                                  action: "withdraw",
                                  matchId: m.id,
                                  refereeId: a.referee_id,
                                })
                              }
                            >
                              {t.withdraw}
                              <span className="sr-only"> : {a.name}</span>
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                    {data.can.manage && data.referees.length > 0 && (
                      <form
                        className="inline-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void send({
                            action: "assign",
                            matchId: m.id,
                            refereeId: f.get("referee"),
                            role: f.get("role"),
                          });
                        }}
                      >
                        <label>
                          <span className="sr-only">{t.referee}</span>
                          <select name="referee" required defaultValue="">
                            <option value="" disabled>
                              {t.referee}
                            </option>
                            {data.referees.map((r) => {
                              const a = availabilityOf(r.id, m.day);
                              return (
                                <option key={r.id} value={r.id}>
                                  {r.name} ·{" "}
                                  {a
                                    ? a.available
                                      ? t.availableOn
                                      : t.unavailableOn
                                    : t.unknown}
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
                        <button className="button secondary" disabled={busy}>
                          {t.assign}
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">{t.noMatch}</p>
          )}
        </>
      )}
    </main>
  );
}
