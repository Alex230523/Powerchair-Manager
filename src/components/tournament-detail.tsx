"use client";
import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { tournamentView } from "@/domains/tournaments/service";
import { stages, type Stage } from "@/domains/tournaments/schema";
import { Badge, Button, Card, DataTable, EmptyState, Field, PageHeader } from "./ui";
import { Modal } from "./modal";
import { Icon } from "./icons";
import { showToast } from "./toast";
import { useData, usePost } from "./use-api";
import { fill, tournamentsCopy } from "./tournaments-copy";
import { ClubPicker, longDate, TournamentForm, tournamentFailure } from "./tournaments";

type View = Awaited<ReturnType<typeof tournamentView>>;
type Day = View["days"][number];
type Match = Day["matches"][number];
type Dialog =
  | { kind: "edit" }
  | { kind: "invite" }
  | { kind: "day"; day: Day | null }
  | { kind: "match"; day: Day; match: Match | null }
  | { kind: "result"; match: Match }
  | null;

/** One tournament: the current situation first, then the match days, the clubs and the rules. */
export function TournamentDetail({ locale, id }: { locale: Locale; id: string }) {
  const t = tournamentsCopy[locale];
  const failure = useCallback((code: string) => tournamentFailure(t)(code), [t]);
  const { data, error, setError, denied, reload } = useData<View>(`/api/tournaments/${id}`, failure);
  const { busy, post } = usePost("/api/tournaments", reload, setError, failure);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [teamName, setTeamName] = useState("");
  const [inviteFilter, setInviteFilter] = useState("");
  const [inviteChosen, setInviteChosen] = useState<string[]>([]);
  const [confirming, setConfirming] = useState("");
  const send = async (body: Record<string, unknown>, done: string) => {
    if (!data) return false;
    const ok = await post({ ...body, id, organizationId: data.organization_id }, done);
    if (ok) showToast({ message: done, icon: "check" });
    return ok;
  };
  const confirmThen = (key: string, run: () => void) => {
    if (confirming !== key) {
      setConfirming(key);
      return;
    }
    setConfirming("");
    run();
  };
  if (!data)
    return (
      <main id="main" className="access tournament">
        <p className="back-link">
          <Link href={`/${locale}/tournaments`}>
            <Icon name="back" size={16} /> {t.back}
          </Link>
        </p>
        {error && <p role="alert">{error}</p>}
        {denied && <p className="notice">{t.errors.FORBIDDEN}</p>}
        {!error && !denied && <p role="status" className="muted">{t.loading}</p>}
      </main>
    );
  const tr = data.tournament;
  const open = tr.status === "open";
  const accepted = data.clubs.filter((c) => c.status === "accepted");
  const mine = data.clubs.find((c) => c.id === data.myClub);
  const leagueRanks = tr.format === "league" || tr.format === "custom";
  const invitable = data.clubOptions.filter((c) => !data.clubs.some((x) => x.id === c.id));
  const roster = (club: string) => data.rosters.filter((r) => r.organization_id === club);
  return (
    <main id="main" className="access tournament">
      <p className="back-link">
        <Link href={`/${locale}/tournaments`}>
          <Icon name="back" size={16} /> {t.back}
        </Link>
      </p>
      <PageHeader
        title={tr.name}
        subtitle={`${fill(t.organisedBy, { name: tr.owner })} · ${tr.year} · ${t.formats[tr.format]}`}
        actions={
          data.manage ? (
            <>
              <Button variant="secondary" icon="settings" onClick={() => setDialog({ kind: "edit" })}>
                {t.edit}
              </Button>
              {open && (
                <>
                  <Button variant="secondary" icon="userPlus" onClick={() => setDialog({ kind: "invite" })}>
                    {t.invite}
                  </Button>
                  <Button variant="secondary" icon="badgeCheck" disabled={busy} onClick={() => confirmThen("finish", () => void send({ action: "finish" }, t.finishedDone))}>
                    {t.finish}
                  </Button>
                  <Button icon="plus" onClick={() => setDialog({ kind: "day", day: null })}>
                    {t.addDay}
                  </Button>
                </>
              )}
            </>
          ) : undefined
        }
      >
        <p className="tournament-badges">
          <Badge tone={open ? "success" : "neutral"}>{open ? t.open : t.finished}</Badge>
          {mine && <Badge tone={mine.status === "invited" ? "warning" : mine.status === "accepted" ? "primary" : "neutral"}>{t[mine.status]}</Badge>}
        </p>
      </PageHeader>
      {confirming === "finish" && (
        <p className="notice" role="alert">
          {t.finishConfirm}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {tr.description && <p className="intro">{tr.description}</p>}

      {data.canRespond && mine && mine.status === "invited" && (
        <Card title={t.invitations} subtitle={t.invitationsText} icon="inbox">
          <Field id="respond-team" label={t.teamName} help={t.teamNameHelp}>
            <input id="respond-team" maxLength={120} aria-describedby="respond-team-help" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
          </Field>
          <div className="actions">
            <Button disabled={busy} onClick={() => void send({ action: "respond", accept: true, teamName }, t.acceptedDone)}>
              {t.accept}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void send({ action: "respond", accept: false, teamName: "" }, t.declinedDone)}>
              {t.decline}
            </Button>
          </div>
        </Card>
      )}

      <section aria-labelledby="situation-title" className="tournament-situation">
        <h2 id="situation-title">{t.situation}</h2>
        {open && <p className="muted">{t.situationProvisional}</p>}
        {data.pending > 0 && <p className="notice">{fill(t.pendingResults, { n: data.pending })}</p>}
        <div className="situation-grid">
          <Card title={t.podium} icon="trophy" className="podium-card">
            {data.podium.length ? (
              <ol className="podium" aria-label={t.podium}>
                {[2, 1, 3].map((rank) => {
                  const p = data.podium.find((x) => x.rank === rank);
                  return p ? (
                    <li key={rank} data-rank={rank} value={rank}>
                      <span className="podium-step" aria-hidden="true">
                        {rank}
                      </span>
                      <span className="podium-rank">{(leagueRanks ? t.ranksLeague : t.ranks)[rank as 1 | 2 | 3]}</span>
                      <strong>{p.name}</strong>
                    </li>
                  ) : null;
                })}
              </ol>
            ) : (
              <p className="muted">{t.noPodium}</p>
            )}
          </Card>
          {data.tables.map((table) => (
            <Card key={table.group || "all"} title={table.group ? fill(t.groupTable, { group: table.group }) : t.standings} icon="chart" className="flush standings-card">
              <DataTable label={table.group ? fill(t.groupTable, { group: table.group }) : t.standings} className="standings">
                <thead>
                  <tr>
                    <th scope="col" className="num">
                      <abbr title={t.colRank}>#</abbr>
                    </th>
                    <th scope="col">{t.colClub}</th>
                    {(
                      [
                        [t.colPlayed, t.colPlayedLong],
                        [t.colWon, t.colWonLong],
                        [t.colDrawn, t.colDrawnLong],
                        [t.colLost, t.colLostLong],
                        [t.colFor, t.colForLong],
                        [t.colAgainst, t.colAgainstLong],
                        [t.colDiff, t.colDiffLong],
                        [t.colPoints, t.colPointsLong],
                      ] as const
                    ).map(([short, long]) => (
                      <th key={long} scope="col" className="num">
                        <abbr title={long}>{short}</abbr>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((r, i) => (
                    <tr key={r.club} data-mine={r.club === data.myClub || undefined}>
                      <td className="num">{i + 1}</td>
                      <th scope="row">{r.name}</th>
                      <td className="num">{r.played}</td>
                      <td className="num">{r.won}</td>
                      <td className="num">{r.drawn}</td>
                      <td className="num">{r.lost}</td>
                      <td className="num">{r.goalsFor}</td>
                      <td className="num">{r.goalsAgainst}</td>
                      <td className="num">{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</td>
                      <td className="num">
                        <strong>{r.points}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </Card>
          ))}
        </div>
        <Card title={t.players} icon="players" className="flush">
          {data.scorers.length ? (
            <DataTable label={t.players}>
              <thead>
                <tr>
                  <th scope="col">{t.colPlayer}</th>
                  <th scope="col">{t.colClub}</th>
                  <th scope="col" className="num">
                    {t.colMatches}
                  </th>
                  <th scope="col" className="num">
                    {t.colGoals}
                  </th>
                  <th scope="col" className="num">
                    {t.colAssists}
                  </th>
                  <th scope="col" className="num">
                    {t.colYellow}
                  </th>
                  <th scope="col" className="num">
                    {t.colRed}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.scorers.map((s) => (
                  <tr key={s.profile}>
                    <th scope="row">{s.name}</th>
                    <td>{s.club}</td>
                    <td className="num">{s.matches}</td>
                    <td className="num">
                      <strong>{s.goals}</strong>
                    </td>
                    <td className="num">{s.assists}</td>
                    <td className="num">{s.yellow}</td>
                    <td className="num">{s.red}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : (
            <p className="muted card-padded">{t.playersEmpty}</p>
          )}
        </Card>
      </section>

      <section aria-labelledby="days-title" className="tournament-days">
        <h2 id="days-title">{t.matchDays}</h2>
        {data.days.length === 0 && (
          <EmptyState icon="calendar" title={t.noDays} action={data.manage && open ? <Button icon="plus" onClick={() => setDialog({ kind: "day", day: null })}>{t.addDay}</Button> : undefined} />
        )}
        {data.days.map((d) => (
          <details key={d.id} id={"day-" + d.id} className="match-day">
            <summary>
              <span className="match-day-title">{d.label || fill(t.dayDefault, { date: longDate(locale, d.day) })}</span>
              <span className="muted">
                {d.label ? longDate(locale, d.day) + " · " : ""}
                {d.venue || d.host_name || ""} · {d.matches.length} {t.matchTitle.toLowerCase()}
              </span>
              <Icon name="chevronDown" size={16} />
            </summary>
            <dl className="facts day-facts">
              <dt>{t.dayDate}</dt>
              <dd>{longDate(locale, d.day)}</dd>
              {d.venue && (
                <>
                  <dt>{t.venue}</dt>
                  <dd>{d.venue}</dd>
                </>
              )}
              {d.host_name && (
                <>
                  <dt>{t.host}</dt>
                  <dd>{d.host_name}</dd>
                </>
              )}
              {d.notes && (
                <>
                  <dt>{t.notes}</dt>
                  <dd className="message-text">{d.notes}</dd>
                </>
              )}
            </dl>
            {d.matches.length === 0 && <p className="muted">{t.noMatches}</p>}
            <ul className="plain-list match-list">
              {d.matches.map((m) => (
                <li key={m.id} className="match-row" data-status={m.status}>
                  <div className="match-line">
                    <span className="match-time">{m.kickoff}</span>
                    <span className="match-stage">
                      {t.stages[m.stage]}
                      {m.group ? ` ${m.group}` : ""}
                    </span>
                    <span className="match-teams">
                      <span data-mine={m.home === data.myClub || undefined}>{m.homeName}</span>
                      <span className="match-score">
                        {m.homeScore === null ? "·" : `${m.homeScore} : ${m.awayScore}`}
                      </span>
                      <span data-mine={m.away === data.myClub || undefined}>{m.awayName}</span>
                    </span>
                    <Badge tone={m.status === "validated" ? "success" : m.status === "reported" ? "warning" : m.status === "cancelled" ? "danger" : "neutral"}>{t.status[m.status]}</Badge>
                  </div>
                  {m.homeShootout !== null && m.awayShootout !== null && <p className="muted small">{fill(t.shootoutScore, { home: m.homeShootout, away: m.awayShootout })}</p>}
                  <p className="muted small">
                    <Icon name="whistle" size={14} /> {m.referee ? `${t.referee} : ${m.referee}` : t.noReferee}
                    {m.reportedBy && ` · ${fill(t.reportedBy, { name: m.reportedBy })}`}
                    {m.validatedBy && ` · ${fill(t.validatedBy, { name: m.validatedBy })}`}
                  </p>
                  {m.stats.length > 0 && (
                    <div className="match-stats">
                      <p className="chair-subtitle">{t.scorers}</p>
                      <ul className="plain-list">
                        {m.stats.map((s) => (
                          <li key={s.profileId}>
                            <strong>{s.name}</strong> <span className="muted">({s.club === m.home ? m.homeName : m.awayName})</span>
                            {s.goals > 0 && ` · ${s.goals} ${t.goals.toLowerCase()}`}
                            {s.assists > 0 && ` · ${s.assists} ${t.assists.toLowerCase()}`}
                            {s.yellowCards > 0 && ` · ${s.yellowCards} ${t.yellow.toLowerCase()}`}
                            {s.redCard && ` · ${t.red.toLowerCase()}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(m.canReport || m.canValidate || (data.manage && open)) && (
                    <div className="actions">
                      {m.canReport && (
                        <Button size="sm" variant={m.status === "scheduled" ? "primary" : "secondary"} onClick={() => setDialog({ kind: "result", match: m })}>
                          {m.status === "scheduled" ? t.enterResult : t.correct}
                        </Button>
                      )}
                      {m.canValidate && (
                        <Button size="sm" disabled={busy} onClick={() => void send({ action: "validate", matchId: m.id, version: m.version }, t.validated)}>
                          {t.validate}
                        </Button>
                      )}
                      {data.manage && open && m.status === "scheduled" && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "match", day: d, match: m })}>
                            {t.editMatch}
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void send({ action: "removeMatch", matchId: m.id }, t.removed)}>
                            {t.removeMatch}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {data.manage && open && (
              <div className="actions">
                <Button size="sm" icon="plus" onClick={() => setDialog({ kind: "match", day: d, match: null })}>
                  {t.addMatch}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "day", day: d })}>
                  {t.editDay}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => confirmThen("day" + d.id, () => void send({ action: "removeDay", dayId: d.id }, t.removed))}>
                  {t.removeDay}
                </Button>
                {confirming === "day" + d.id && (
                  <span className="notice" role="alert">
                    {t.removeDayConfirm}
                  </span>
                )}
              </div>
            )}
          </details>
        ))}
      </section>

      <div className="tournament-side">
        <Card title={t.clubs} icon="club">
          {data.clubs.length ? (
            <ul className="plain-list tournament-clubs">
              {data.clubs.map((c) => (
                <li key={c.id}>
                  <span>
                    <strong>{c.name}</strong>
                    {c.name !== c.clubName && <span className="muted"> ({c.clubName})</span>}
                  </span>
                  <Badge tone={c.status === "accepted" ? "success" : c.status === "invited" ? "warning" : "neutral"}>{t[c.status]}</Badge>
                  {data.manage && open && tr.format === "groups_knockout" && c.status === "accepted" && (
                    <label className="inline-field">
                      <span>{t.group}</span>
                      <input
                        defaultValue={c.group}
                        maxLength={20}
                        size={4}
                        onBlur={(e) => e.target.value !== c.group && void send({ action: "group", club: c.id, group: e.target.value }, t.saved)}
                      />
                    </label>
                  )}
                  {data.manage && open && c.id !== data.organization_id && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void send({ action: "uninvite", club: c.id }, t.removed)}>
                      {t.uninvite}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t.clubsEmpty}</p>
          )}
        </Card>
        <Card title={t.rulesTitle} icon="document">
          <ul className="plain-list rules-list">
            {(tr.format === "league" || tr.format === "custom") && <li>{fill(t.ruleLegs, { v: tr.rules.legs === 2 ? t.legsTwo : t.legsOne })}</li>}
            {tr.format === "groups_knockout" && <li>{fill(t.ruleGroups, { groups: tr.rules.groups, qualifiers: tr.rules.qualifiers })}</li>}
            {tr.format !== "knockout" && <li>{fill(t.rulePoints, { win: tr.rules.win, draw: tr.rules.draw, loss: tr.rules.loss })}</li>}
            <li>{fill(t.ruleTime, { halves: tr.rules.halves, minutes: tr.rules.halfMinutes })}</li>
            {tr.format !== "knockout" && <li>{fill(t.ruleTiebreak, { v: t.tiebreaks[tr.rules.tiebreak].toLowerCase() })}</li>}
            {(tr.format === "knockout" || tr.format === "groups_knockout") && tr.rules.shootout && <li>{t.ruleShootout}</li>}
            {tr.rules.other && <li className="message-text">{tr.rules.other}</li>}
          </ul>
        </Card>
      </div>

      {dialog?.kind === "edit" && (
        <TournamentForm
          locale={locale}
          busy={busy}
          year={tr.year}
          clubOptions={[]}
          initial={{ name: tr.name, year: tr.year, format: tr.format, rules: tr.rules, description: tr.description }}
          close={() => setDialog(null)}
          submit={async (body) => {
            const { clubs: _clubs, ...fields } = body;
            void _clubs;
            if (await send({ action: "update", version: tr.version, ...fields }, t.saved)) setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "invite" && (
        <Modal title={t.invite} close={() => setDialog(null)} className="player-dialog tournament-dialog">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (inviteChosen.length && (await send({ action: "invite", clubs: inviteChosen }, t.saved))) {
                setInviteChosen([]);
                setDialog(null);
              }
            }}
          >
            <ClubPicker
              locale={locale}
              options={invitable.filter((c) => c.name.toLowerCase().includes(inviteFilter.trim().toLowerCase()))}
              filter={inviteFilter}
              setFilter={setInviteFilter}
              chosen={inviteChosen}
              setChosen={setInviteChosen}
            />
            <div className="actions">
              <Button type="submit" loading={busy} disabled={!inviteChosen.length}>
                {t.invite}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDialog(null)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {dialog?.kind === "day" && (
        <DayForm
          locale={locale}
          busy={busy}
          day={dialog.day}
          hosts={accepted}
          close={() => setDialog(null)}
          submit={async (body) => {
            if (await send({ action: "day", ...body }, t.saved)) setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "match" && (
        <MatchForm
          locale={locale}
          busy={busy}
          day={dialog.day}
          match={dialog.match}
          clubs={accepted}
          referees={data.referees}
          close={() => setDialog(null)}
          submit={async (body) => {
            if (await send({ action: "match", ...body }, t.saved)) setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "result" && (
        <ResultForm
          locale={locale}
          busy={busy}
          match={dialog.match}
          rosters={Object.fromEntries(dialog.match.statClubs.map((c) => [c, roster(c)]))}
          close={() => setDialog(null)}
          submit={async (body, validate) => {
            if (await send({ action: "result", matchId: dialog.match.id, version: dialog.match.version, ...body, validate }, validate ? t.validated : t.reported)) setDialog(null);
          }}
        />
      )}
    </main>
  );
}

function DayForm({
  locale,
  busy,
  day,
  hosts,
  close,
  submit,
}: {
  locale: Locale;
  busy: boolean;
  day: Day | null;
  hosts: { id: string; name: string }[];
  close: () => void;
  submit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const t = tournamentsCopy[locale];
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void submit({
      dayId: day?.id ?? null,
      label: String(f.get("label") ?? ""),
      day: String(f.get("day")),
      venue: String(f.get("venue") ?? ""),
      hostId: String(f.get("host") ?? "") || null,
      notes: String(f.get("notes") ?? ""),
    });
  }
  return (
    <Modal title={day ? t.editDay : t.addDay} close={close} className="player-dialog tournament-dialog">
      <form onSubmit={onSubmit}>
        <div className="form-pair">
          <Field id="d-date" label={t.dayDate} required>
            <input id="d-date" name="day" type="date" required defaultValue={day?.day} />
          </Field>
          <Field id="d-label" label={t.dayLabel}>
            <input id="d-label" name="label" maxLength={120} defaultValue={day?.label} />
          </Field>
          <Field id="d-venue" label={t.venue}>
            <input id="d-venue" name="venue" maxLength={200} defaultValue={day?.venue} />
          </Field>
          <Field id="d-host" label={t.host}>
            <select id="d-host" name="host" defaultValue={day?.host_id ?? ""}>
              <option value="">{t.noHost}</option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field id="d-notes" label={t.notes}>
          <textarea id="d-notes" name="notes" maxLength={2000} rows={3} defaultValue={day?.notes} />
        </Field>
        <div className="actions">
          <Button type="submit" loading={busy}>
            {t.save}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MatchForm({
  locale,
  busy,
  day,
  match,
  clubs,
  referees,
  close,
  submit,
}: {
  locale: Locale;
  busy: boolean;
  day: Day;
  match: Match | null;
  clubs: { id: string; name: string; group: string }[];
  referees: { id: string; name: string }[];
  close: () => void;
  submit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const t = tournamentsCopy[locale];
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void submit({
      matchId: match?.id ?? null,
      dayId: day.id,
      kickoff: String(f.get("kickoff")),
      stage: String(f.get("stage")) as Stage,
      group: String(f.get("group") ?? ""),
      home: String(f.get("home")),
      away: String(f.get("away")),
      refereeId: String(f.get("referee") ?? "") || null,
    });
  }
  return (
    <Modal title={match ? t.editMatch : t.addMatch} close={close} className="player-dialog tournament-dialog">
      {clubs.length < 2 ? (
        <p className="notice">{t.needTwoClubs}</p>
      ) : (
        <form onSubmit={onSubmit}>
          <div className="form-pair">
            <Field id="m-kickoff" label={t.kickoff} required>
              <input id="m-kickoff" name="kickoff" type="time" required defaultValue={match?.kickoff ?? "10:00"} />
            </Field>
            <Field id="m-stage" label={t.stage}>
              <select id="m-stage" name="stage" defaultValue={match?.stage ?? "league"}>
                {stages.map((s) => (
                  <option key={s} value={s}>
                    {t.stages[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="m-group" label={t.groupLabel}>
              <input id="m-group" name="group" maxLength={20} defaultValue={match?.group} />
            </Field>
            <Field id="m-home" label={t.home} required>
              <select id="m-home" name="home" required defaultValue={match?.home ?? ""}>
                <option value="" disabled>
                  {t.chooseClub}
                </option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="m-away" label={t.away} required>
              <select id="m-away" name="away" required defaultValue={match?.away ?? ""}>
                <option value="" disabled>
                  {t.chooseClub}
                </option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="m-referee" label={t.referee}>
              <select id="m-referee" name="referee" defaultValue={match?.refereeId ?? ""}>
                <option value="">{t.noReferee}</option>
                {referees.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="actions">
            <Button type="submit" loading={busy}>
              {t.save}
            </Button>
            <Button type="button" variant="secondary" onClick={close}>
              {t.cancel}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

type Line = { goals: number; assists: number; yellowCards: number; redCard: boolean };
function ResultForm({
  locale,
  busy,
  match,
  rosters,
  close,
  submit,
}: {
  locale: Locale;
  busy: boolean;
  match: Match;
  rosters: Record<string, { id: string; name: string }[]>;
  close: () => void;
  submit: (body: Record<string, unknown>, validate: boolean) => Promise<void>;
}) {
  const t = tournamentsCopy[locale];
  const knockout = !["league", "group", "other"].includes(match.stage);
  const [lines, setLines] = useState<Record<string, Line>>(
    Object.fromEntries(match.stats.map((s) => [s.profileId, { goals: s.goals, assists: s.assists, yellowCards: s.yellowCards, redCard: s.redCard }])),
  );
  const checker = match.canValidate || match.statClubs.length === 2;
  const line = (id: string) => lines[id] ?? { goals: 0, assists: 0, yellowCards: 0, redCard: false };
  const set = (id: string, patch: Partial<Line>) => setLines({ ...lines, [id]: { ...line(id), ...patch } });
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (f.get(k) === "" || f.get(k) === null ? null : Number(f.get(k)));
    const allowed = new Set(Object.values(rosters).flat().map((r) => r.id));
    void submit(
      {
        homeScore: num("homeScore") ?? 0,
        awayScore: num("awayScore") ?? 0,
        homeShootout: knockout ? num("homeShootout") : null,
        awayShootout: knockout ? num("awayShootout") : null,
        stats: Object.entries(lines)
          .filter(([id]) => allowed.has(id))
          .map(([profileId, l]) => ({ profileId, ...l })),
      },
      checker && f.has("validate"),
    );
  }
  return (
    <Modal title={fill(t.resultTitle, { home: match.homeName, away: match.awayName })} close={close} className="player-dialog tournament-dialog">
      <p className="muted">{t.firstWins}</p>
      <form onSubmit={onSubmit}>
        <div className="form-pair">
          <Field id="r-home" label={fill(t.homeScore, { name: match.homeName })} required>
            <input id="r-home" name="homeScore" type="number" min={0} max={99} required defaultValue={match.homeScore ?? undefined} />
          </Field>
          <Field id="r-away" label={fill(t.awayScore, { name: match.awayName })} required>
            <input id="r-away" name="awayScore" type="number" min={0} max={99} required defaultValue={match.awayScore ?? undefined} />
          </Field>
          {knockout && (
            <>
              <Field id="r-home-so" label={fill(t.homeShootout, { name: match.homeName })}>
                <input id="r-home-so" name="homeShootout" type="number" min={0} max={99} defaultValue={match.homeShootout ?? undefined} />
              </Field>
              <Field id="r-away-so" label={fill(t.awayShootout, { name: match.awayName })}>
                <input id="r-away-so" name="awayShootout" type="number" min={0} max={99} defaultValue={match.awayShootout ?? undefined} />
              </Field>
            </>
          )}
        </div>
        {match.statClubs.map((club) => (
          <fieldset key={club} className="stat-lines">
            <legend>{fill(t.playerLines, { name: club === match.home ? match.homeName : match.awayName })}</legend>
            <DataTable label={fill(t.playerLines, { name: club === match.home ? match.homeName : match.awayName })}>
              <thead>
                <tr>
                  <th scope="col">{t.colPlayer}</th>
                  <th scope="col" className="num">
                    {t.goals}
                  </th>
                  <th scope="col" className="num">
                    {t.assists}
                  </th>
                  <th scope="col" className="num">
                    {t.yellow}
                  </th>
                  <th scope="col">{t.red}</th>
                </tr>
              </thead>
              <tbody>
                {(rosters[club] ?? []).map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{p.name}</th>
                    <td className="num">
                      <input aria-label={`${t.goals} ${p.name}`} type="number" min={0} max={50} value={line(p.id).goals} onChange={(e) => set(p.id, { goals: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="num">
                      <input aria-label={`${t.assists} ${p.name}`} type="number" min={0} max={50} value={line(p.id).assists} onChange={(e) => set(p.id, { assists: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="num">
                      <input
                        aria-label={`${t.yellow} ${p.name}`}
                        type="number"
                        min={0}
                        max={2}
                        value={line(p.id).yellowCards}
                        onChange={(e) => set(p.id, { yellowCards: Math.min(2, Number(e.target.value) || 0) })}
                      />
                    </td>
                    <td>
                      <input aria-label={`${t.red} ${p.name}`} type="checkbox" checked={line(p.id).redCard} onChange={(e) => set(p.id, { redCard: e.target.checked })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </fieldset>
        ))}
        {checker && (
          <label className="check">
            <input type="checkbox" name="validate" defaultChecked /> {t.validateNow}
          </label>
        )}
        <div className="actions">
          <Button type="submit" loading={busy}>
            {t.save}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
