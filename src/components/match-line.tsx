"use client";
import Link from "next/link";
import { useState } from "react";
import type { Locale } from "@/lib/locale";
import type { matchesView, MatchLine as Line } from "@/domains/competitions/service";
import { matchLineCopy } from "./match-line-copy";
import { matchesCopy } from "./matches-copy";
import { Badge, Button, Card, EmptyState } from "./ui";
import { Modal } from "./modal";
import { Tip } from "./tip";

type View = Awaited<ReturnType<typeof matchesView>>;
type Match = View["matches"][number];
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const tones = { ok: "success", warn: "warning", low: "danger" } as const;

/** Wave 17 (C5): answers, referee and transport of an upcoming match. */
export function MatchLine({ locale, m, canEdit, busy, send }: { locale: Locale; m: Match; canEdit: boolean; busy: boolean; send: (b: Record<string, unknown>, done?: string) => Promise<boolean> }) {
  const t = matchLineCopy[locale];
  const line = m.line as Line | null;
  const referees = (m.referees as { name: string; role: string; status: string }[]) ?? [];
  const main = referees.find((r) => r.role === "main") ?? referees[0];
  const invitation = m.invitation as { status: "sent" | "accepted" | "refused" | "cancelled"; answer: string } | null;
  const names = (list: string[]) => (list.length ? list.join(", ") : t.nobody);
  return (
    <div className="match-line">
      {invitation && invitation.status !== "accepted" && (
        <span className="match-line-item">
          <Badge tone={invitation.status === "sent" ? "info" : invitation.status === "refused" ? "danger" : "neutral"}>{t.invitation[invitation.status]}</Badge>
          {invitation.answer && <span className="muted small"> · {invitation.answer}</span>}
          {invitation.status === "sent" && canEdit && (
            <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "cancelInvitation", id: m.id })}>
              {t.cancelInvitation}
            </button>
          )}
        </span>
      )}
      {line && (
        <>
          <Tip label={fill(t.players, { n: line.players.coming, t: line.players.invited })} tone={tones[line.players.tone]}>
            {fill(t.coming, { names: names(line.players.names) })}
            <br />
            {fill(t.waiting, { names: names(line.players.waiting) })}
          </Tip>
          <Tip label={fill(t.coaches, { n: line.coaches.coming, t: line.coaches.invited })} tone={tones[line.coaches.tone]}>
            {fill(t.coming, { names: names(line.coaches.names) })}
            <br />
            {fill(t.waiting, { names: names(line.coaches.waiting) })}
          </Tip>
          {main ? (
            <Tip label={fill(t.referee, { name: main.name })} tone="neutral">
              {referees.map((r) => `${r.name} (${t.refereeRole[r.role] ?? r.role}, ${t.refereeStatus[r.status] ?? r.status})`).join(" · ")}
            </Tip>
          ) : (
            <Badge tone="neutral">{t.noReferee}</Badge>
          )}
          <span className="match-line-item">
            <span className="muted small">{t.transport} : </span>
            <Badge tone={line.transport === "todo" ? "warning" : "success"}>{t.transportState[line.transport]}</Badge>
            {line.transport === "todo" &&
              (line.transportTasks > 0 ? (
                <Link className="text-button" href={`/${locale}/tasks?kind=transport`}>
                  {fill(t.tasksLink, { n: line.transportTasks })}
                </Link>
              ) : (
                canEdit && (
                  <Button size="sm" variant="secondary" disabled={busy} aria-label={fill(t.organizeOf, { match: m.opponent })} onClick={() => void send({ action: "organizeTransport", id: m.id })}>
                    {t.organize}
                  </Button>
                )
              ))}
          </span>
        </>
      )}
    </div>
  );
}

/** The score proposed by the other club: « à confirmer », and the button for the club that did not propose it. */
export function ScoreToConfirm({ locale, m, canEdit, busy, send }: { locale: Locale; m: Match; canEdit: boolean; busy: boolean; send: (b: Record<string, unknown>, done?: string) => Promise<boolean> }) {
  const t = matchLineCopy[locale];
  if (m.score_status !== "proposed") return null;
  return (
    <span className="score-confirm">
      <Badge tone="warning">{t.toConfirm}</Badge>
      {!m.score_ours && canEdit && (
        <Button size="sm" variant="secondary" disabled={busy} aria-label={fill(t.confirmOf, { match: m.opponent })} onClick={() => void send({ action: "confirmScore", id: m.id }, t.confirmed)}>
          {t.confirmScore}
        </Button>
      )}
    </span>
  );
}

export function Invitations({ locale, view, busy, send }: { locale: Locale; view: View; busy: boolean; send: (b: Record<string, unknown>, done?: string) => Promise<boolean> }) {
  const t = matchLineCopy[locale];
  const [refusing, setRefusing] = useState<{ id: string; club: string } | null>(null);
  if (!view.invitations.length) return null;
  const when = (d: string) => new Intl.DateTimeFormat(tag(locale), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(d));
  return (
    <Card title={t.invitations} labelledBy="match-invitations" headingId="match-invitations">
      <p className="muted">{t.invitationsIntro}</p>
      <ul className="profile-list">
        {view.invitations.map((i) => (
          <li key={i.id}>
            <div>
              <strong>{fill(t.invitedBy, { club: i.club, team: i.team, ours: i.invited_team })}</strong>
              <p className="muted small">
                {when(i.starts_at)}
                {i.venue ? ` · ${i.venue}` : ""}
              </p>
              {i.message && <p className="small">{i.message}</p>}
            </div>
            <div className="row-actions">
              <Button size="sm" disabled={busy} aria-label={fill(t.acceptOf, { club: i.club })} onClick={() => void send({ action: "answerInvitation", id: i.id, accept: true, answer: "" })}>
                {t.accept}
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} aria-label={fill(t.refuseOf, { club: i.club })} onClick={() => setRefusing({ id: i.id, club: i.club })}>
                {t.refuse}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {refusing && (
        <Modal title={fill(t.refuseOf, { club: refusing.club })} close={() => setRefusing(null)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const answer = String(new FormData(e.currentTarget).get("answer") ?? "");
              void send({ action: "answerInvitation", id: refusing.id, accept: false, answer }).then((ok) => ok && setRefusing(null));
            }}
          >
            <label>
              {t.answer}
              <textarea name="answer" maxLength={500} />
            </label>
            <div className="form-actions">
              <Button type="submit" disabled={busy}>
                {t.refuse}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setRefusing(null)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}

/** Wave 17 (C5): « Nouveau match amical ». */
export function FriendlyDialog({ locale, view, busy, close, send }: { locale: Locale; view: View; busy: boolean; close: () => void; send: (b: Record<string, unknown>, done?: string) => Promise<boolean> }) {
  const t = matchLineCopy[locale];
  const [opponent, setOpponent] = useState(""),
    [place, setPlace] = useState("");
  const ours = view.teams.filter((x) => x.manageable);
  const clubs = [...new Set(view.opponents.map((o) => o.club))];
  return (
    <Modal title={t.newFriendly} close={close}>
      <p className="muted">{t.friendlyIntro}</p>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const v = (k: string) => String(f.get(k) ?? "").trim();
          void send(
            {
              action: "friendly",
              teamId: v("team"),
              opponentTeamId: opponent && opponent !== "other" ? opponent : null,
              opponentName: v("opponentName"),
              home: v("home") !== "away",
              startsAt: v("when"),
              placeId: place && place !== "other" ? place : null,
              venue: v("venue"),
              message: v("message"),
            },
            t.sent,
          ).then((ok) => ok && close());
        }}
      >
        <label>
          {t.ourTeam}
          <select name="team" required defaultValue={ours[0]?.id}>
            {ours.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.opponentTeam}
          <select name="opponent" required value={opponent} onChange={(e) => setOpponent(e.target.value)}>
            <option value="" disabled>
              {t.opponentTeam}
            </option>
            {clubs.map((club) => (
              <optgroup key={club} label={club}>
                {view.opponents
                  .filter((o) => o.club === club)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
              </optgroup>
            ))}
            <option value="other">{t.otherOpponent}</option>
          </select>
        </label>
        {opponent === "other" && (
          <label>
            {t.otherName}
            <input name="opponentName" required minLength={2} maxLength={120} />
          </label>
        )}
        <label>
          {t.when}
          <input name="when" type="datetime-local" required />
        </label>
        <label>
          {t.place}
          <select name="place" value={place} onChange={(e) => setPlace(e.target.value)}>
            <option value="">{t.noPlace}</option>
            {view.places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {!place && (
          <label>
            {t.venue}
            <input name="venue" maxLength={200} />
          </label>
        )}
        <fieldset className="check-row">
          <legend>{t.homeAway}</legend>
          <label className="check">
            <input type="radio" name="home" value="home" defaultChecked />
            {matchesCopy[locale].home}
          </label>
          <label className="check">
            <input type="radio" name="home" value="away" />
            {matchesCopy[locale].away}
          </label>
        </fieldset>
        <label>
          {t.message}
          <textarea name="message" maxLength={500} />
        </label>
        <div className="form-actions">
          <Button type="submit" disabled={busy}>
            {t.send}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Wave 17 (C5): the federal tournament matches of the club, by match day. */
export function TournamentMatches({ locale, view }: { locale: Locale; view: View }) {
  const t = matchLineCopy[locale];
  const day = (d: string) => new Intl.DateTimeFormat(tag(locale), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  return (
    <Card title={t.tournament} labelledBy="tournament-matches" headingId="tournament-matches">
      <p className="muted">{t.tournamentIntro}</p>
      {view.tournament.length ? (
        view.tournament.map((g) => (
          <section key={g.id} className="tournament-day" aria-labelledby={`tday-${g.id}`}>
            <h3 id={`tday-${g.id}`}>
              {g.tournament} · {g.label || day(g.day)} · {day(g.day)}
            </h3>
            <ul className="plain-list">
              {g.matches.map((m) => (
                <li key={m.id}>
                  <strong>{m.kickoff}</strong> · {m.home} {t.vs} {m.away}
                  <span className="muted"> · {t.stage[m.stage] ?? m.stage}</span>
                  {m.home_score !== null && (
                    <strong>
                      {" "}
                      · {m.home_score}-{m.away_score}
                    </strong>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <EmptyState title={t.noTournament} />
      )}
    </Card>
  );
}
