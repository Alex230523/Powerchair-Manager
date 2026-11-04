"use client";
import Link from "next/link";
import { useCallback } from "react";
import type { Locale } from "@/lib/locale";
import type { matchesView } from "@/domains/competitions/service";
import { matchRowCopy, fill } from "./match-row-copy";
import { MatchRow, ResultPill, type RowMatch } from "./match-row";
import { useData } from "./use-api";

/**
 * 5: the team cards of the Matches page (to the team's game statistics),
 * the matches of a team or a player with the same line, and the
 * head-to-head before a match.
 */
type View = Awaited<ReturnType<typeof matchesView>>;
type Match = View["matches"][number];
type Team = View["teams"][number];
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

/** A club match as the one line. */
export function rowOf(locale: Locale, m: Match): RowMatch {
  return {
    id: m.id,
    local: m.local_start,
    team: m.team,
    teamColor: (m.team_color as string | null) ?? null,
    opponent: m.opponent,
    home: m.home,
    ours: m.our_score,
    theirs: m.their_score,
    status: m.status,
    unconfirmed: m.score_status === "proposed",
    context: m.kind === "tournament" ? { kind: "tournament", name: m.competition || matchRowCopy[locale].contexts.tournament } : { kind: m.kind as "friendly" | "league" | "cup", name: m.competition || undefined },
    venue: m.venue,
    href: `/${locale}/matches/${m.id}`,
  };
}

export function TeamCard({ locale, team }: { locale: Locale; team: Team }) {
  const t = matchRowCopy[locale];
  const r = team.record;
  const base = `/${locale}/statistics/game?team=${team.id}`;
  return (
    <article className="team-card" data-color={team.color ?? "none"} aria-labelledby={`tc-${team.id}`}>
      <h2 id={`tc-${team.id}`}>
        <Link href={base}>
          {team.name}
          <span className="sr-only"> : {fill(t.cardOf, { team: team.name })}</span>
        </Link>
      </h2>
      <p className="team-card-record">
        <Link href={`${base}#stats-teams`}>
          <abbr title={fill(t.playedLong, { n: r.played })}>{t.played}</abbr> {r.played}
        </Link>
        <Link href={`${base}#stats-teams`}>
          <abbr title={fill(t.wonLong, { n: r.won })}>{t.won}</abbr> {r.won}
        </Link>
        <Link href={`${base}#stats-teams`}>
          <abbr title={fill(t.drawnLong, { n: r.drawn })}>{t.drawn}</abbr> {r.drawn}
        </Link>
        <Link href={`${base}#stats-teams`}>
          <abbr title={fill(t.lostLong, { n: r.lost })}>{t.lost}</abbr> {r.lost}
        </Link>
      </p>
      <p className="small">
        <Link href={`${base}#stats-goals`}>{fill(t.goals, { f: r.goalsFor, a: r.goalsAgainst })}</Link>
      </p>
      <p className="small">
        <span className="muted">{t.form} : </span>
        {team.form.length ? (
          <span className="form-pills" role="img" aria-label={fill(t.formSaid, { n: team.form.length, list: team.form.map((o) => t.said[o].split(" {o}")[0]).join(", ") })}>
            {team.form.map((o, i) => (
              <span key={i} aria-hidden="true">
                <ResultPill locale={locale} outcome={o} />
              </span>
            ))}
          </span>
        ) : (
          <span className="muted">{t.noForm}</span>
        )}
      </p>
      <p className="muted small">
        {team.next ? (
          <Link href={`/${locale}/matches/${team.next.id}`}>
            {fill(t.next, {
              opponent: team.next.opponent,
              date: new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(team.next.local_start.slice(0, 10) + "T12:00:00Z")),
            })}
          </Link>
        ) : (
          t.noNext
        )}
      </p>
    </article>
  );
}

/** The matches of some teams (a team's sheet, a player's), upcoming and latest, with the same line. */
export function TeamMatches({ locale, teamIds, limit = 3 }: { locale: Locale; teamIds: string[]; limit?: number }) {
  const t = matchRowCopy[locale];
  const failure = useCallback(() => "", []);
  const { data } = useData<View>("/api/matches", failure);
  if (!data) return null;
  const mine = data.matches.filter((m) => teamIds.includes(m.team_id));
  const upcoming = mine.filter((m) => m.status !== "played" && m.local_start.slice(0, 10) >= data.today).sort((a, b) => a.local_start.localeCompare(b.local_start)).slice(0, limit);
  const recent = mine.filter((m) => m.status === "played").sort((a, b) => b.local_start.localeCompare(a.local_start)).slice(0, limit);
  return (
    <section className="team-matches" aria-labelledby={`tm-${teamIds.join("-").slice(0, 36)}`}>
      <h2 id={`tm-${teamIds.join("-").slice(0, 36)}`}>{t.teamMatches}</h2>
      <h3>{t.upcoming}</h3>
      {upcoming.length ? (
        <ul className="match-list">
          {upcoming.map((m) => (
            <li key={m.id}>
              <MatchRow locale={locale} m={rowOf(locale, m)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t.noneUpcoming}</p>
      )}
      <h3>{t.recent}</h3>
      {recent.length ? (
        <ul className="match-list">
          {recent.map((m) => (
            <li key={m.id}>
              <MatchRow locale={locale} m={rowOf(locale, m)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t.noneRecent}</p>
      )}
      <p>
        <Link href={`/${locale}/matches`}>{t.allMatches}</Link>
      </p>
    </section>
  );
}

/** Before a match: the last results against the same opponent (confirmed scores only). */
export function HeadToHead({ locale, matchId, opponent, teamId }: { locale: Locale; matchId: string; opponent: string; teamId: string }) {
  const t = matchRowCopy[locale];
  const failure = useCallback(() => "", []);
  const { data } = useData<View>("/api/matches", failure);
  if (!data) return null;
  const key = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const past = data.matches
    .filter((m) => m.id !== matchId && m.team_id === teamId && m.status === "played" && m.score_status !== "proposed" && key(m.opponent) === key(opponent))
    .sort((a, b) => b.local_start.localeCompare(a.local_start));
  const count = (o: "win" | "draw" | "loss") => past.filter((m) => (o === "win" ? m.our_score! > m.their_score! : o === "loss" ? m.our_score! < m.their_score! : m.our_score === m.their_score)).length;
  return (
    <section className="head-to-head" aria-labelledby="h2h-title">
      <h2 id="h2h-title">{t.h2h}</h2>
      <p className="muted">{fill(t.h2hIntro, { opponent })}</p>
      {past.length ? (
        <>
          <p>{fill(t.h2hRecord, { w: count("win"), d: count("draw"), l: count("loss") })}</p>
          <ul className="match-list">
            {past.slice(0, 5).map((m) => (
              <li key={m.id}>
                <MatchRow locale={locale} m={rowOf(locale, m)} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">{t.h2hNone}</p>
      )}
    </section>
  );
}
