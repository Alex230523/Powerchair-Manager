"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { matchesView, matchDetail } from "@/domains/competitions/service";
import {
  matchKinds,
  matchStatuses,
  fromOurSide,
} from "@/domains/competitions/schema";
import { matchesCopy } from "./matches-copy";
import { errors } from "./access-copy";
import { Modal } from "./modal";

type View = Awaited<ReturnType<typeof matchesView>>;
type Match = View["matches"][number];
type Detail = Awaited<ReturnType<typeof matchDetail>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

/** Club matches: fixtures, line-ups, results and player statistics. */
export function Matches({ locale }: { locale: Locale }) {
  const t = matchesCopy[locale];
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [team, setTeam] = useState(""),
    [show, setShow] = useState<"upcoming" | "played" | "all">("upcoming"),
    [editing, setEditing] = useState<Match | "new" | null>(null),
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

  async function send(body: Record<string, unknown>) {
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
      setMessage(t.saved);
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
  const when = (d: string) =>
    new Intl.DateTimeFormat(tag(locale), {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Brussels",
    }).format(new Date(d));

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
        <h1>{t.title}</h1>
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const manageable = view.teams.filter((x) => x.manageable);
  const now = view.today;
  const list = view.matches
    .filter((m) => !team || m.team_id === team)
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
      <div className="directory-heading">
        <div>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
        </div>
        {manageable.length > 0 && (
          <div className="directory-actions">
            <button
              type="button"
              className="button"
              onClick={() => setEditing("new")}
            >
              {t.add}
            </button>
          </div>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

      {view.teams.length > 0 && (
        <ul className="team-cards">
          {view.teams.map((x) => (
            <li key={x.id}>
              <strong>{x.name}</strong>
              <span className="muted">
                {t.record
                  .replace("{p}", String(x.record.played))
                  .replace("{w}", String(x.record.won))
                  .replace("{d}", String(x.record.drawn))
                  .replace("{l}", String(x.record.lost))
                  .replace("{pts}", String(x.record.points))
                  .replace("{gf}", String(x.record.goalsFor))
                  .replace("{ga}", String(x.record.goalsAgainst))}
              </span>
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
      </form>

      {list.length ? (
        <div
          className="table-scroll"
          role="region"
          aria-label={t.title}
          tabIndex={0}
        >
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">{t.date2}</th>
                <th scope="col">{t.team}</th>
                <th scope="col">{t.opponent}</th>
                <th scope="col">{t.kind}</th>
                <th scope="col">{t.score}</th>
                <th scope="col">{t.referees}</th>
                <th scope="col">
                  <span className="sr-only">{t.edit}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const report = m.report as {
                  home_score: number;
                  away_score: number;
                  incidents: string;
                } | null;
                const official = report
                  ? fromOurSide(m.home, report.home_score, report.away_score)
                  : null;
                const canEdit = manageable.some((x) => x.id === m.team_id);
                return (
                  <tr
                    key={m.id}
                    data-cancelled={m.status === "cancelled" || undefined}
                  >
                    <td>{when(m.starts_at)}</td>
                    <td>{m.team}</td>
                    <td>
                      <strong>{m.opponent}</strong>
                      <span className="muted">
                        {" "}
                        · {m.home ? t.home : t.away}
                      </span>
                      {m.venue && <span className="muted"> · {m.venue}</span>}
                    </td>
                    <td>
                      {t.kinds[m.kind]}
                      {m.competition && (
                        <span className="muted"> · {m.competition}</span>
                      )}
                    </td>
                    <td>
                      {m.status === "played" ? (
                        <strong
                          className={
                            m.our_score! > m.their_score!
                              ? "amount-in"
                              : m.our_score! < m.their_score!
                                ? "amount-out"
                                : ""
                          }
                        >
                          {m.our_score}-{m.their_score}
                        </strong>
                      ) : (
                        <span
                          className="status-tag"
                          data-tone={
                            m.status === "cancelled"
                              ? "danger"
                              : m.status === "postponed"
                                ? "warning"
                                : ""
                          }
                        >
                          {t.statuses[m.status]}
                        </span>
                      )}
                      {report && (
                        <details className="report-details">
                          <summary>
                            {t.report} {official?.our}-{official?.their}
                          </summary>
                          {report.incidents && (
                            <p className="message-text">{report.incidents}</p>
                          )}
                        </details>
                      )}
                    </td>
                    <td>
                      {(m.referees as { name: string; status: string }[])
                        .map((r) => r.name)
                        .join(", ")}
                    </td>
                    <td>
                      {canEdit && (
                        <div className="row-actions">
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => void open("lineup", m)}
                          >
                            {t.lineup}
                            <span className="sr-only"> : {m.opponent}</span>
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => void open("result", m)}
                          >
                            {t.result}
                            <span className="sr-only"> : {m.opponent}</span>
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => setEditing(m)}
                          >
                            {t.edit}
                            <span className="sr-only"> : {m.opponent}</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-directory">{t.empty}</p>
      )}

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
