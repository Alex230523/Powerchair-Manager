"use client";
import Link from "next/link";
import { sidelineCopy } from "./sideline-copy";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { useScopedTeam, ApplyScope } from "./use-scope";
import type { matchesView, matchDetail } from "@/domains/competitions/service";
import {
  matchKinds,
  matchStatuses,
  fromOurSide,
} from "@/domains/competitions/schema";
import { matchesCopy } from "./matches-copy";
import { matchLineCopy } from "./match-line-copy";
import { FriendlyDialog, Invitations, MatchLine, ScoreToConfirm, TournamentMatches } from "./match-line";
import { errors } from "./access-copy";
import { Modal } from "./modal";
import { EmptyState, ExportButton, PageHeader } from "./ui";
import { MatchRow } from "./match-row";
import { TeamCard, rowOf } from "./match-cards";

type View = Awaited<ReturnType<typeof matchesView>>;
type Match = View["matches"][number];
type Detail = Awaited<ReturnType<typeof matchDetail>>;

/** Club matches: fixtures, line-ups, results and player statistics. */
export function Matches({ locale }: { locale: Locale }) {
  const t = matchesCopy[locale];
  const lc = matchLineCopy[locale];
  const { team, setTeam, differs: teamDiffers, apply: applyTeam } = useScopedTeam();
  const [competition, setCompetition] = useState("");
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState<"upcoming" | "played" | "all">("upcoming"),
    [editing, setEditing] = useState<Match | "new" | null>(null),
    [friendly, setFriendly] = useState(false),
    [choosing, setChoosing] = useState(false),
    [dialog, setDialog] = useState<{
      kind: "lineup" | "result";
      match: Match;
      detail: Detail;
    } | null>(null);
  const failure = useCallback(
    (code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable,
    [t, locale],
  );
  const load = useCallback(async () => {
    const r = await fetch("/api/matches", { cache: "no-store" });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setView(v);
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/matches", { cache: "no-store" })
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
  }, [failure]);

  async function send(body: Record<string, unknown>, done?: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/matches", {
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
      setMessage(done ?? (typeof v.tasks === "number" ? lc.organized.replace("{n}", String(v.tasks)) : t.saved));
      return true;
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function open(kind: "lineup" | "result", match: Match) {
    setError("");
    const r = await fetch("/api/matches?id=" + match.id, { cache: "no-store" });
    const v = await r.json();
    if (!r.ok) return setError(failure(v.error));
    setDialog({ kind, match, detail: v });
  }

  function saveMatch(e: FormEvent<HTMLFormElement>, current: Match | null) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    void send({
      action: current ? "update" : "create",
      ...(current
        ? { id: current.id, version: current.version, status: v("status") }
        : {}),
      teamId: v("team"),
      opponent: v("opponent"),
      home: v("home") === "home",
      kind: v("kind"),
      competition: v("competition"),
      startsAt: v("startsAt"),
      venue: v("venue"),
      calendarEventId: v("event") || null,
      notes: v("notes"),
    }).then((ok) => ok && setEditing(null));
  }

  if (!view)
    return (
      <main id="main" className="access matches">
        <PageHeader title={t.title} />
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const manageable = view.teams.filter((x) => x.manageable);
  const now = view.today;
  const list = view.matches
    .filter((m) => !team || m.team_id === team)
    .filter((m) => !competition || m.kind === competition)
    .filter((m) =>
      show === "all"
        ? true
        : show === "played"
          ? m.status === "played"
          : m.status !== "played" && m.local_start.slice(0, 10) >= now,
    )
    .sort((a, b) =>
      show === "upcoming"
        ? a.local_start.localeCompare(b.local_start)
        : b.local_start.localeCompare(a.local_start),
    );
  const current = editing && editing !== "new" ? editing : null;

  return (
    <main id="main" className="access matches">
      <PageHeader title={t.title} subtitle={t.intro} actions={manageable.length > 0 && (
          <div className="directory-actions">
            {/* 1: one « Nouveau match »; the window asks friendly or competition first. */}
            <button type="button" className="button" onClick={() => (view.can.friendly ? setChoosing(true) : setEditing("new"))}>
              {t.add}
            </button>
          </div>
        )} />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <Invitations locale={locale} view={view} busy={busy} send={send} />

      {/* 5: one card per team, in its colour, to the team's game statistics. */}
      {view.teams.length > 0 && (
        <ul className="team-cards">
          {view.teams.map((x) => (
            <li key={x.id}>
              <TeamCard locale={locale} team={x} />
            </li>
          ))}
        </ul>
      )}

      <form className="directory-filters" onSubmit={(e) => e.preventDefault()}>
        <label>
          {t.team}
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">{t.allTeams}</option>
            {view.teams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <ApplyScope locale={locale} differs={teamDiffers} apply={applyTeam} />
        </label>
        <label>
          {t.show}
          <select
            value={show}
            onChange={(e) => setShow(e.target.value as typeof show)}
          >
            <option value="upcoming">{t.upcoming}</option>
            <option value="played">{t.played}</option>
            <option value="all">{t.all}</option>
          </select>
        </label>
        <label>
          {t.kind}
          <select value={competition} onChange={(e) => setCompetition(e.target.value)}>
            <option value="">{t.allKinds}</option>
            {matchKinds.map((k) => (
              <option key={k} value={k}>
                {t.kinds[k]}
              </option>
            ))}
          </select>
        </label>
        {/* Wave 17 (G2): the matches shown, with the filters chosen. */}
        <ExportButton
          locale={locale}
          organizationId={view.organization_id}
          dataset="matches"
          subject={t.title}
          period={show === "all" ? "" : show === "played" ? t.played : t.upcoming}
          rows={list}
          columns={[
            { id: "date", label: t.date2, type: "date", value: (m) => m.local_start.slice(0, 10) },
            { id: "time", label: t.date.split(" ").pop() ?? "", value: (m) => m.local_start.slice(11, 16) },
            { id: "team", label: t.team, value: (m) => m.team },
            { id: "opponent", label: t.opponent, value: (m) => m.opponent },
            { id: "where", label: t.where, value: (m) => (m.home ? t.home : t.away) },
            { id: "kind", label: t.kind, value: (m) => t.kinds[m.kind] },
            { id: "competition", label: t.competition.split(" (")[0], value: (m) => m.competition },
            { id: "venue", label: t.venue, value: (m) => m.venue },
            { id: "status", label: t.status, value: (m) => t.statuses[m.status] },
            { id: "ours", label: t.ourScore, type: "number", value: (m) => m.our_score },
            { id: "theirs", label: t.theirScore, type: "number", value: (m) => m.their_score },
            { id: "referees", label: t.referees, value: (m) => (m.referees as { name: string }[]).map((r) => r.name).join(", ") },
          ]}
        />
      </form>

      {list.length ? (
        <ul className="match-list" aria-label={t.title}>
          {list.map((m) => {
            const report = m.report as { home_score: number; away_score: number; incidents: string } | null;
            const official = report ? fromOurSide(m.home, report.home_score, report.away_score) : null;
            const canEdit = manageable.some((x) => x.id === m.team_id);
            return (
              <li key={m.id} data-cancelled={m.status === "cancelled" || undefined}>
                <MatchRow
                  locale={locale}
                  m={rowOf(locale, m)}
                  details={
                    <>
                      {m.status !== "played" && <MatchLine locale={locale} m={m} canEdit={canEdit} busy={busy} send={send} />}
                      <ScoreToConfirm locale={locale} m={m} canEdit={canEdit} busy={busy} send={send} />
                      {report && (
                        <details className="report-details">
                          <summary>
                            {t.report} {official?.our}-{official?.their}
                          </summary>
                          {report.incidents && <p className="message-text">{report.incidents}</p>}
                        </details>
                      )}
                    </>
                  }
                  actions={
                    canEdit && (
                      <div className="row-actions">
                        <button type="button" className="text-button" onClick={() => void open("lineup", m)}>
                          {t.lineup}
                          <span className="sr-only"> : {m.opponent}</span>
                        </button>
                        <button type="button" className="text-button" onClick={() => void open("result", m)}>
                          {t.result}
                          <span className="sr-only"> : {m.opponent}</span>
                        </button>
                        <button type="button" className="text-button" onClick={() => setEditing(m)}>
                          {t.edit}
                          <span className="sr-only"> : {m.opponent}</span>
                        </button>
                        {/* 14: the match day on a phone. */}
                        {m.status !== "played" && m.status !== "cancelled" && (
                          <Link className="text-button" href={`/${locale}/matches/${m.id}/terrain`}>
                            {sidelineCopy[locale].open}
                            <span className="sr-only"> : {m.opponent}</span>
                          </Link>
                        )}
                      </div>
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title={t.empty} />
      )}

      <TournamentMatches locale={locale} view={view} />
      {choosing && (
        <Modal title={t.kindTitle} close={() => setChoosing(false)}>
          <ul className="choice-cards">
            <li>
              <button
                type="button"
                className="choice-card"
                onClick={() => {
                  setChoosing(false);
                  setFriendly(true);
                }}
              >
                <strong>{t.kindFriendly}</strong>
                <span className="muted">{t.kindFriendlyHint}</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className="choice-card"
                onClick={() => {
                  setChoosing(false);
                  setEditing("new");
                }}
              >
                <strong>{t.kindCompetition}</strong>
                <span className="muted">{t.kindCompetitionHint}</span>
              </button>
            </li>
          </ul>
        </Modal>
      )}
      {friendly && <FriendlyDialog locale={locale} view={view} busy={busy} close={() => setFriendly(false)} send={send} />}
      {editing && (
        <Modal
          title={current ? `${t.edit} : ${current.opponent}` : t.add}
          close={() => setEditing(null)}
        >
          <p className="muted">{t.official}</p>
          <form
            className="finance-form"
            onSubmit={(e) => saveMatch(e, current)}
          >
            <div className="form-pair">
              <label htmlFor="m-team">
                {t.team}
                <select
                  id="m-team"
                  name="team"
                  required
                  defaultValue={current?.team_id ?? manageable[0]?.id}
                >
                  {manageable.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="m-opponent">
                {t.opponent}
                <input
                  id="m-opponent"
                  name="opponent"
                  required
                  minLength={2}
                  maxLength={120}
                  defaultValue={current?.opponent}
                />
              </label>
            </div>
            <div className="form-pair">
              <label htmlFor="m-home">
                {t.where}
                <select
                  id="m-home"
                  name="home"
                  defaultValue={current && !current.home ? "away" : "home"}
                >
                  <option value="home">{t.home}</option>
                  <option value="away">{t.away}</option>
                </select>
              </label>
              <label htmlFor="m-kind">
                {t.kind}
                <select
                  id="m-kind"
                  name="kind"
                  defaultValue={current?.kind ?? "league"}
                >
                  {matchKinds.map((k) => (
                    <option key={k} value={k}>
                      {t.kinds[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label htmlFor="m-competition">
              {t.competition}
              <input
                id="m-competition"
                name="competition"
                maxLength={120}
                defaultValue={current?.competition}
              />
            </label>
            <div className="form-pair">
              <label htmlFor="m-start">
                {t.date}
                <input
                  id="m-start"
                  name="startsAt"
                  type="datetime-local"
                  required
                  defaultValue={current?.local_start}
                />
              </label>
              <label htmlFor="m-venue">
                {t.venue}
                <input
                  id="m-venue"
                  name="venue"
                  maxLength={200}
                  defaultValue={current?.venue}
                />
              </label>
            </div>
            <label htmlFor="m-event">
              {t.event}
              <select
                id="m-event"
                name="event"
                defaultValue={current?.calendar_event_id ?? ""}
              >
                <option value="">{t.noEvent}</option>
                {view.events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} · {ev.local_start.replace("T", " ")}
                  </option>
                ))}
              </select>
            </label>
            {current && (
              <label htmlFor="m-status">
                {t.status}
                <select
                  id="m-status"
                  name="status"
                  defaultValue={
                    current.status === "played" ? "scheduled" : current.status
                  }
                >
                  {matchStatuses
                    .filter((x) => x !== "played")
                    .map((x) => (
                      <option key={x} value={x}>
                        {t.statuses[x]}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label htmlFor="m-notes">
              {t.notes}
              <textarea
                id="m-notes"
                name="notes"
                maxLength={2000}
                defaultValue={current?.notes}
              />
            </label>
            <button className="button" disabled={busy}>
              {t.save}
            </button>
          </form>
        </Modal>
      )}

      {dialog?.kind === "lineup" && (
        <Modal
          title={`${t.lineup} : ${dialog.match.opponent}`}
          close={() => setDialog(null)}
        >
          <p className="muted">{t.lineupHint}</p>
          <form
            className="finance-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const players = view.players
                .filter(
                  (x) =>
                    x.team_id === dialog.match.team_id &&
                    f.has("in-" + x.profile_id),
                )
                .map((x) => ({
                  profileId: x.profile_id,
                  starter: f.has("starter-" + x.profile_id),
                  position: String(f.get("position-" + x.profile_id) ?? "")
                    .trim()
                    .slice(0, 40),
                  jerseyNumber: f.get("number-" + x.profile_id)
                    ? Number(f.get("number-" + x.profile_id))
                    : null,
                }));
              void send({
                action: "lineup",
                id: dialog.match.id,
                players,
              }).then((ok) => ok && setDialog(null));
            }}
          >
            <div className="table-scroll">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">{t.players}</th>
                    <th scope="col">{t.starter}</th>
                    <th scope="col">{t.position}</th>
                    <th scope="col">{t.number}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.players
                    .filter((x) => x.team_id === dialog.match.team_id)
                    .map((x) => {
                      const line = dialog.detail.lineup.find(
                        (l) => l.profile_id === x.profile_id,
                      );
                      return (
                        <tr key={x.profile_id}>
                          <td>
                            <label className="check">
                              <input
                                type="checkbox"
                                name={"in-" + x.profile_id}
                                defaultChecked={!!line}
                              />
                              {x.full_name}
                            </label>
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              name={"starter-" + x.profile_id}
                              aria-label={`${t.starter} : ${x.full_name}`}
                              defaultChecked={!!line?.starter}
                            />
                          </td>
                          <td>
                            <input
                              name={"position-" + x.profile_id}
                              aria-label={`${t.position} : ${x.full_name}`}
                              maxLength={40}
                              defaultValue={line?.position ?? x.position}
                            />
                          </td>
                          <td>
                            <input
                              name={"number-" + x.profile_id}
                              type="number"
                              min={0}
                              max={99}
                              aria-label={`${t.number} : ${x.full_name}`}
                              defaultValue={
                                line?.jersey_number ?? x.jersey_number ?? ""
                              }
                              className="narrow"
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <button className="button" disabled={busy}>
              {t.saveLineup}
            </button>
          </form>
        </Modal>
      )}

      {dialog?.kind === "result" && (
        <Modal
          title={`${t.result} : ${dialog.match.opponent}`}
          close={() => setDialog(null)}
        >
          {dialog.detail.lineup.length ? (
            <form
              className="finance-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const n = (k: string) => Number(f.get(k) ?? 0) || 0;
                void send({
                  action: "result",
                  id: dialog.match.id,
                  version: dialog.match.version,
                  ourScore: n("our"),
                  theirScore: n("their"),
                  stats: dialog.detail.lineup.map((l) => ({
                    profileId: l.profile_id,
                    minutes: n("min-" + l.profile_id),
                    goals: n("goals-" + l.profile_id),
                    assists: n("assists-" + l.profile_id),
                    yellowCards: n("yellow-" + l.profile_id),
                    redCard: f.has("red-" + l.profile_id),
                  })),
                }).then((ok) => ok && setDialog(null));
              }}
            >
              <div className="form-pair">
                <label htmlFor="r-our">
                  {t.ourScore}
                  <input
                    id="r-our"
                    name="our"
                    type="number"
                    min={0}
                    max={99}
                    required
                    defaultValue={dialog.match.our_score ?? ""}
                  />
                </label>
                <label htmlFor="r-their">
                  {t.theirScore}
                  <input
                    id="r-their"
                    name="their"
                    type="number"
                    min={0}
                    max={99}
                    required
                    defaultValue={dialog.match.their_score ?? ""}
                  />
                </label>
              </div>
              <div className="table-scroll">
                <table className="ledger stats-table">
                  <thead>
                    <tr>
                      <th scope="col">{t.players}</th>
                      <th scope="col">{t.minutes}</th>
                      <th scope="col">{t.goals}</th>
                      <th scope="col">{t.assists}</th>
                      <th scope="col">{t.yellow}</th>
                      <th scope="col">{t.red}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dialog.detail.lineup.map((l) => (
                      <tr key={l.profile_id}>
                        <td>
                          {l.full_name}
                          {l.starter && (
                            <span className="muted"> · {t.starter}</span>
                          )}
                        </td>
                        {(
                          [
                            ["min", t.minutes, l.minutes, 200],
                            ["goals", t.goals, l.goals, 50],
                            ["assists", t.assists, l.assists, 50],
                            ["yellow", t.yellow, l.yellow_cards, 2],
                          ] as const
                        ).map(([key, label, value, max]) => (
                          <td key={key}>
                            <input
                              className="narrow"
                              name={`${key}-${l.profile_id}`}
                              type="number"
                              min={0}
                              max={max}
                              aria-label={`${label} : ${l.full_name}`}
                              defaultValue={value || ""}
                            />
                          </td>
                        ))}
                        <td>
                          <input
                            type="checkbox"
                            name={"red-" + l.profile_id}
                            aria-label={`${t.red} : ${l.full_name}`}
                            defaultChecked={l.red_card}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="button" disabled={busy}>
                {t.saveResult}
              </button>
            </form>
          ) : (
            <p className="notice">{t.noLineup}</p>
          )}
        </Modal>
      )}
    </main>
  );
}
