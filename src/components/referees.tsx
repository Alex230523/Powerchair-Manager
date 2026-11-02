"use client";
import Link from "next/link";
import { ClassificationDays } from "./classification-days";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import type {
  refereeView,
  designationsView,
} from "@/domains/competitions/service";
import { refereesCopy, weekendDays } from "./referees-copy";
import { errors } from "./access-copy";
import { useData } from "./use-api";
import { Badge, PageHeader, Card, EmptyState } from "./ui";
import { RefereeRoster } from "./federation-referees";

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

export function RefereeSpace({ locale }: { locale: Locale }) {
  const t = refereesCopy[locale];
  const failure = useCallback(
    (code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable,
    [t, locale],
  );
  const { data, error, setError, denied, reload } = useData<
    Awaited<ReturnType<typeof refereeView>>
  >("/api/referee", failure);
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
      <PageHeader
        title={t.refereeTitle}
        subtitle={t.refereeIntro}
        actions={
          <>
            <Link className="button secondary" href={`/${locale}/guide/game`}>
              {t.guideGame}
            </Link>
            <Link className="button secondary" href={`/${locale}/guide/chair`}>
              {t.guideChair}
            </Link>
          </>
        }
      />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {denied && <p className="notice">{t.denied}</p>}
      {!data && !denied && !error && <p role="status">{t.loading}</p>}
      {data && (
        <div className="grid">
          <Card title={t.assignments} labelledBy="ref-assignments" headingId="ref-assignments">
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
                      <Badge tone={
                          a.status === "accepted"
                            ? "success"
                            : a.status === "declined"
                              ? "danger"
                              : "warning"
                        }>
                        {t.statuses[a.status]}
                      </Badge>
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
              <EmptyState title={t.noAssignment} />
            )}
          </Card>
          <Card title={t.availability} labelledBy="ref-availability" headingId="ref-availability">
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
          </Card>
        </div>
      )}
      {data && <ClassificationDays locale={locale} />}
    </main>
  );
}

export function Designations({ locale }: { locale: Locale }) {
  const t = refereesCopy[locale];
  const failure = useCallback(
    (code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable,
    [t, locale],
  );
  const { data, error, setError, denied, reload } = useData<
    Awaited<ReturnType<typeof designationsView>>
  >("/api/designations", failure);
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
      <PageHeader title={t.designTitle} subtitle={t.designIntro} />
      {!denied && <RefereeRoster locale={locale} />}
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
                      <Badge tone="success">
                        {t.reportDone} {report.home_score}-{report.away_score}
                      </Badge>
                    )}
                    <ul className="assigned-referees">
                      {assigned.map((a) => (
                        <li key={a.referee_id}>
                          {a.name} · {t.roles[a.role]}{" "}
                          <Badge tone={
                              a.status === "accepted"
                                ? "success"
                                : a.status === "declined"
                                  ? "danger"
                                  : "warning"
                            }>
                            {t.statuses[a.status]}
                          </Badge>
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
            <EmptyState title={t.noMatch} />
          )}
        </>
      )}
    </main>
  );
}
