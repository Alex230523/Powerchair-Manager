"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import { outcomeOf, type Outcome } from "@/domains/competitions/schema";
import { matchRowCopy, fill } from "./match-row-copy";
import { Badge } from "./ui";

/**
 * 5: one line of match, the same everywhere (the club's matches, tournament
 * matches, friendlies, a team's sheet, a player's): the date and time, our
 * colour and team, the score or « - », the opponent; a context badge; before
 * the match its place and its answers, after it the result's pill with its
 * letter (V, N, D) and its words for screen readers, « à confirmer » while
 * the other club has not confirmed.
 */
export type RowMatch = {
  id: string;
  /** Local date and time, YYYY-MM-DDTHH:MM (Brussels). */
  local: string;
  team: string;
  teamColor: string | null;
  opponent: string;
  home: boolean | null;
  ours: number | null;
  theirs: number | null;
  status: string;
  /** The score is the other club's proposal, not confirmed yet. */
  unconfirmed?: boolean;
  context: { kind: "tournament"; name: string; day?: string; group?: string; href?: string } | { kind: "friendly" | "league" | "cup"; name?: string };
  venue?: string;
  href?: string;
};
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

/** The result's pill: the letter seen, the words read, never the colour alone. */
export function ResultPill({ locale, outcome, ours, theirs }: { locale: Locale; outcome: Outcome; ours?: number; theirs?: number }) {
  const t = matchRowCopy[locale];
  return (
    <span className="result-pill" data-outcome={outcome}>
      <span aria-hidden="true">{t.letters[outcome]}</span>
      <span className="sr-only">{ours === undefined ? t.said[outcome].split(" {o}")[0] : fill(t.said[outcome], { o: ours, t: theirs ?? 0 })}</span>
    </span>
  );
}

export function MatchRow({ locale, m, details, actions }: { locale: Locale; m: RowMatch; details?: ReactNode; actions?: ReactNode }) {
  const t = matchRowCopy[locale];
  const played = m.status === "played" && m.ours !== null && m.theirs !== null;
  const outcome = played ? outcomeOf(m.ours, m.theirs) : null;
  const date = new Date(m.local.slice(0, 10) + "T12:00:00Z");
  const day = new Intl.DateTimeFormat(tag(locale), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(date);
  const context =
    m.context.kind === "tournament" ? (
      ((label) =>
        m.context.kind === "tournament" && m.context.href ? (
          <Link href={m.context.href} className="match-context">
            {label}
          </Link>
        ) : (
          <span className="match-context">{label}</span>
        ))(fill(t.tournamentLabel, { name: m.context.name, day: m.context.day ? fill(t.day, { d: m.context.day }) : "", group: m.context.group ? fill(t.group, { g: m.context.group }) : "" }))
    ) : (
      <span className="match-context">
        {t.contexts[m.context.kind]}
        {m.context.name ? ` · ${m.context.name}` : ""}
      </span>
    );
  const opponent = m.href ? <Link href={m.href}>{m.opponent}</Link> : m.opponent;
  return (
    <article className="match-row" data-outcome={outcome ?? undefined} data-status={m.status} aria-label={`${m.team} ${t.vs} ${m.opponent}, ${day}`}>
      <p className="match-when">
        <span>{day}</span>
        <span className="muted">{m.local.slice(11, 16)}</span>
      </p>
      <p className="match-teams">
        <span className="team-chip" data-color={m.teamColor ?? "none"}>
          <span className="team-dot" aria-hidden="true" />
          <strong>{m.team}</strong>
        </span>
        <span className="match-score" aria-hidden={outcome ? "true" : undefined}>
          {played ? `${m.ours}-${m.theirs}` : t.noScore}
        </span>
        <span className="match-opponent">{opponent}</span>
        {m.home !== null && <span className="muted small"> · {m.home ? t.home : t.away}</span>}
      </p>
      <p className="match-meta">
        {outcome && <ResultPill locale={locale} outcome={outcome} ours={m.ours!} theirs={m.theirs!} />}
        {m.unconfirmed && <Badge tone="warning">{t.toConfirm}</Badge>}
        {!played && m.status !== "scheduled" && <Badge tone={m.status === "cancelled" ? "danger" : "warning"}>{t.statuses[m.status] ?? m.status}</Badge>}
        {context}
        {!played && m.venue && <span className="muted small">{m.venue}</span>}
      </p>
      {details && <div className="match-details">{details}</div>}
      {actions && <div className="match-actions">{actions}</div>}
    </article>
  );
}
