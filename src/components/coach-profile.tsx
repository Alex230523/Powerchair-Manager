"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { coachProfileView } from "@/domains/coaches/service";
import { rate } from "@/domains/player-profile/schema";
import { coachProfileCopy } from "./coach-profile-copy";
import { kindLabels } from "./calendar-copy";
import { errors } from "./access-copy";
import { Icon } from "./icons";
import { initials } from "./app-shell";
import { Card, Stat } from "./player-profile";
import { Badge } from "./ui";

type View = Awaited<ReturnType<typeof coachProfileView>>;
const record = {
  fr: {
    title: "Bilan des matchs :",
    line: "{p} joués, {w} victoires, {d} nuls, {l} défaites, buts {gf}-{ga}",
  },
  nl: {
    title: "Wedstrijdbalans:",
    line: "{p} gespeeld, {w} gewonnen, {d} gelijk, {l} verloren, doelpunten {gf}-{ga}",
  },
  en: {
    title: "Match record:",
    line: "{p} played, {w} won, {d} drawn, {l} lost, goals {gf}-{ga}",
  },
};
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

/** Coach profile: details, teams, upcoming sessions, attendance and courses. */
export function CoachProfile({ locale, id }: { locale: Locale; id: string }) {
  const t = coachProfileCopy[locale];
  const kinds = kindLabels[locale] as Record<string, string>;
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const failure = useCallback(
    (code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable,
    [t, locale],
  );
  const day = (d: string | null | undefined) =>
    d
      ? new Intl.DateTimeFormat(tag(locale), {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(d.slice(0, 10) + "T12:00:00Z"))
      : t.noAnswer;
  const when = (d: string | Date) =>
    new Intl.DateTimeFormat(tag(locale), {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Brussels",
    }).format(new Date(d));

  const load = useCallback(async () => {
    const r = await fetch("/api/coach-profile?id=" + encodeURIComponent(id), {
      cache: "no-store",
    });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setView(v);
  }, [id]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/coach-profile?id=" + encodeURIComponent(id), {
      cache: "no-store",
    })
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
  }, [id, failure]);

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/coach-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          organizationId: view?.organization_id,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await load();
      setMessage(done);
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }
  function request(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void send(
      {
        action: "requestCourse",
        profileId: id,
        courseId: f.get("course"),
        note: f.get("note") ?? "",
      },
      t.requested,
    );
    e.currentTarget.reset();
  }

  const back = (
    <p className="back-link">
      <Link href={`/${locale}/coaches`}>
        <Icon name="back" size={16} />
        {t.back}
      </Link>
    </p>
  );
  if (!view)
    return (
      <main id="main" className="access player-profile">
        {back}
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );

  const c = view.coach,
    a = view.attendance;
  const groups = [
    { key: "training", label: t.training, v: a.training },
    { key: "match", label: t.matches, v: a.match },
    { key: "other", label: t.other, v: a.other },
  ].filter((g) => g.key !== "other" || g.v.invited > 0);
  const current = view.teams.filter((x) => x.current);
  return (
    <main id="main" className="access player-profile coach-profile">
      {back}
      <div className="profile-hero">
        <span className="avatar avatar-xl" aria-hidden="true">
          {initials(c.full_name)}
        </span>
        <div className="profile-title">
          <h1>{c.full_name}</h1>
          <ul className="profile-tags">
            <li data-tone="accent">{t.coach}</li>
            {current.map((x) => (
              <li key={x.id}>{x.team}</li>
            ))}
            {(c.former || c.status !== "active") && (
              <li data-tone="muted">{t.former}</li>
            )}
          </ul>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

      <div className="profile-grid">
        <Card title={t.identity} icon="user">
          {view.details ? (
            <dl className="facts">
              <dt>{t.email}</dt>
              <dd>{c.email || t.noAnswer}</dd>
              <dt>{t.phone}</dt>
              <dd>{c.phone || t.noAnswer}</dd>
              <dt>{t.birth}</dt>
              <dd>
                {c.birth_date ? day(c.birth_date) : t.noAnswer}
                {c.age != null && ` · ${c.age} ${t.years}`}
              </dd>
              <dt>{t.joined}</dt>
              <dd>{day(c.joined_on)}</dd>
              <dt>{t.account}</dt>
              <dd>{c.has_account ? t.yes : t.no}</dd>
            </dl>
          ) : (
            <p className="muted">{t.noDetails}</p>
          )}
        </Card>

        <Card title={t.teams} icon="team">
          {view.teams.length ? (
            <ol className="timeline">
              {view.teams.map((x) => (
                <li key={x.id} data-current={x.current || undefined}>
                  <strong>
                    {x.team} · {x.season}
                  </strong>
                  <span>
                    {t.roles[x.role] ?? x.role} · {day(x.starts_on)}
                    {x.ends_on ? ` → ${day(x.ends_on)}` : ""}
                  </span>
                  <Badge tone={x.current ? "success" : ""}>
                    {x.current ? t.current : t.ended}
                  </Badge>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">{t.noTeam}</p>
          )}
          {view.results.played > 0 && (
            <p className="team-record">
              <strong>{record[locale].title}</strong>{" "}
              {record[locale].line
                .replace("{p}", String(view.results.played))
                .replace("{w}", String(view.results.won))
                .replace("{d}", String(view.results.drawn))
                .replace("{l}", String(view.results.lost))
                .replace("{gf}", String(view.results.goalsFor))
                .replace("{ga}", String(view.results.goalsAgainst))}
            </p>
          )}
        </Card>

        <Card title={t.presence} icon="attendance" wide>
          <p className="muted">{t.presenceHint}</p>
          <div className="stat-row">
            {groups.map((g) => (
              <Stat
                key={g.key}
                label={g.label}
                value={rate(g.v.attended, g.v.closed)}
                hint={`${g.v.attended} / ${g.v.closed} ${t.sessions}`}
              />
            ))}
          </div>
        </Card>

        <Card title={t.upcoming} icon="calendar" wide>
          {view.upcoming.length ? (
            <ul className="records">
              {view.upcoming.map((e) => (
                <li key={e.id}>
                  <strong>{e.title}</strong>
                  <span className="muted">
                    {" "}
                    · {when(e.starts_at)} · {kinds[e.kind] ?? e.kind}
                    {e.team ? ` · ${e.team}` : ""}
                  </span>
                  <Badge tone={
                      e.response === "present"
                        ? "success"
                        : e.response === "absent"
                          ? "danger"
                          : e.response === "uncertain"
                            ? "warning"
                            : ""
                    }>
                    {e.response ? t.responses[e.response] : t.noAnswer}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t.noUpcoming}</p>
          )}
        </Card>

        <Card title={t.formations} icon="check" wide>
          <p className="muted">{t.formationsHint}</p>
          {view.formations.length ? (
            <ul className="records">
              {view.formations.map((f) => (
                <li key={f.id}>
                  <strong>{f.title}</strong>
                  <span className="muted">
                    {" "}
                    · {f.federation}
                    {f.level ? ` · ${f.level}` : ""}
                    {f.hours ? ` · ${f.hours} ${t.hours}` : ""}
                    {f.completed_on &&
                      ` · ${t.completed} ${day(f.completed_on)}`}
                    {f.valid_until &&
                      ` · ${t.validUntil} ${day(f.valid_until)}`}
                  </span>
                  <Badge tone={
                      f.status === "approved"
                        ? "success"
                        : f.status === "refused"
                          ? "danger"
                          : f.status === "requested"
                            ? "warning"
                            : ""
                    }>
                    {t.statuses[f.status] ?? f.status}
                  </Badge>
                  {f.decision_note && (
                    <span className="muted"> · {f.decision_note}</span>
                  )}
                  {view.can.request && f.status === "requested" && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void send(
                          { action: "cancelRequest", id: f.id },
                          t.cancelRequest,
                        )
                      }
                    >
                      {t.cancelRequest}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t.noFormation}</p>
          )}
          {view.can.request &&
            (view.courses.length ? (
              <form onSubmit={request} className="finance-form course-request">
                <h3>{t.requestTitle}</h3>
                <label htmlFor="course-choice">
                  {t.course}
                  <select
                    id="course-choice"
                    name="course"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      {t.chooseCourse}
                    </option>
                    {view.courses.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.title}
                        {k.level ? ` (${k.level})` : ""} · {k.federation}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="course-note">
                  {t.note}
                  <textarea id="course-note" name="note" maxLength={1000} />
                </label>
                <button className="button" disabled={busy}>
                  {t.request}
                </button>
              </form>
            ) : (
              <p className="notice">
                {view.federation ? t.noCourses : t.noFederation}
              </p>
            ))}
        </Card>
      </div>
    </main>
  );
}
