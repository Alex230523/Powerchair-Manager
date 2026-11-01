import Link from "next/link";
import type { Locale } from "@/lib/locale";
import type { publicClub, publicTournament } from "@/domains/integrations/public";
import { publicCopy } from "./public-copy";
import { fill } from "./fleet-copy";

/**
 * B6: the public club page and its widgets, rendered on the server (no
 * script needed), and a tournament's public page. Only what the club chose
 * to show; scores validated; a minor's name only with consent.
 */
type Club = NonNullable<Awaited<ReturnType<typeof publicClub>>>;
type Tournament = NonNullable<Awaited<ReturnType<typeof publicTournament>>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const when = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(d));
const day = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { dateStyle: "long", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z"));

export function NextMatches({ locale, club, limit = 8 }: { locale: Locale; club: Club; limit?: number }) {
  const t = publicCopy[locale].page;
  if (!club.next.length) return <p className="muted">{t.noMatches}</p>;
  return (
    <ul className="records public-matches">
      {club.next.slice(0, limit).map((m) => (
        <li key={m.id}>
          <strong>{m.home ? `${m.team} - ${m.opponent}` : `${m.opponent} - ${m.team}`}</strong>
          <span className="muted">
            {" "}
            · {when(locale, m.starts_at)} · {m.home ? t.home : t.away}
            {m.competition ? ` · ${m.competition}` : ""}
            {m.venue ? ` · ${m.venue}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
export function Results({ locale, club, limit = 8 }: { locale: Locale; club: Club; limit?: number }) {
  const t = publicCopy[locale].page;
  if (!club.results.length) return <p className="muted">{t.noResults}</p>;
  return (
    <ul className="records public-matches">
      {club.results.slice(0, limit).map((m) => (
        <li key={m.id}>
          <strong>{m.home ? `${m.team} ${m.our_score} - ${m.their_score} ${m.opponent}` : `${m.opponent} ${m.their_score} - ${m.our_score} ${m.team}`}</strong>
          <span className="muted">
            {" "}
            · {day(locale, m.starts_at)}
            {m.competition ? ` · ${m.competition}` : ""}
          </span>
          {m.scorers.length > 0 && (
            <p className="small">
              {t.scorers} : {m.scorers.map((s) => `${s.name ?? t.aPlayer}${s.goals > 1 ? ` (${s.goals})` : ""}`).join(", ")}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
export function Standings({ locale, tables, title }: { locale: Locale; tables: Club["standings"][number]["tables"]; title: string }) {
  const t = publicCopy[locale].page;
  return (
    <>
      {tables.map((g) => (
        <div key={g.group} className="table-scroll" role="region" aria-label={g.group ? `${title} · ${g.group}` : title} tabIndex={0}>
          <table className="data-table">
            <caption>{g.group ? `${title} · ${g.group}` : title}</caption>
            <thead>
              <tr>
                <th scope="col">{t.team}</th>
                <th scope="col" className="num">
                  {t.played}
                </th>
                <th scope="col" className="num">
                  {t.goals}
                </th>
                <th scope="col" className="num">
                  {t.points}
                </th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.club}>
                  <th scope="row">{r.name}</th>
                  <td className="num">{r.played}</td>
                  <td className="num">{`${r.goalsFor}-${r.goalsAgainst}`}</td>
                  <td className="num">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

export function PublicClub({ locale, slug, club }: { locale: Locale; slug: string; club: Club }) {
  const t = publicCopy[locale].page;
  const has = (b: string) => club.blocks.includes(b);
  return (
    <main id="main" className="access public-page">
      <header className="public-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {club.logo && <img className="club-banner-logo" src={`/api/public/club/${slug}`} alt="" width={72} height={72} />}
        <div>
          <h1>{club.name}</h1>
          {club.city && <p className="muted">{club.city}</p>}
        </div>
      </header>
      {club.intro && <p className="public-intro">{club.intro}</p>}
      {has("teams") && club.teams.length > 0 && (
        <section aria-labelledby="pc-teams">
          <h2 id="pc-teams">{t.teams}</h2>
          <ul className="plain-list">
            {club.teams.map((x) => (
              <li key={x.name}>
                {x.name}
                {x.category ? <span className="muted"> · {x.category}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
      {has("next_matches") && (
        <section aria-labelledby="pc-next">
          <h2 id="pc-next">{t.nextMatches}</h2>
          <NextMatches locale={locale} club={club} />
        </section>
      )}
      {has("results") && (
        <section aria-labelledby="pc-results">
          <h2 id="pc-results">{t.results}</h2>
          <Results locale={locale} club={club} />
        </section>
      )}
      {has("standings") && club.standings.length > 0 && (
        <section aria-labelledby="pc-standings">
          <h2 id="pc-standings">{t.standings}</h2>
          {club.standings.map((s) => (
            <div key={s.id}>
              <h3>
                <Link href={`/${locale}/t/${s.id}`}>{`${s.name} ${s.year}`}</Link>
              </h3>
              <Standings locale={locale} tables={s.tables} title={`${s.name} ${s.year}`} />
            </div>
          ))}
        </section>
      )}
      {has("sponsors") && club.sponsors.length > 0 && (
        <section aria-labelledby="pc-sponsors">
          <h2 id="pc-sponsors">{t.sponsors}</h2>
          <ul className="public-sponsors">
            {club.sponsors.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      )}
      <p className="muted small">{t.poweredBy}</p>
    </main>
  );
}

export function PublicTournament({ locale, tournament: x }: { locale: Locale; tournament: Tournament }) {
  const t = publicCopy[locale].page;
  const byDay = x.days.map((d) => ({ ...d, matches: x.matches.filter((m) => m.day === d.day) }));
  return (
    <main id="main" className="access public-page">
      <header className="public-hero">
        <div>
          <h1>{`${x.name} ${x.year}`}</h1>
          <p className="muted">{x.owner}</p>
        </div>
      </header>
      {x.description && <p className="public-intro">{x.description}</p>}
      {x.podium.length > 0 && (
        <ol className="plain-list">
          {x.podium.map((p) => (
            <li key={p.rank}>{`${p.rank}. ${p.name}`}</li>
          ))}
        </ol>
      )}
      {x.tables.length > 0 && (
        <section aria-labelledby="pt-standings">
          <h2 id="pt-standings">{t.standings}</h2>
          <Standings locale={locale} tables={x.tables} title={t.standings} />
        </section>
      )}
      <section aria-labelledby="pt-days">
        <h2 id="pt-days">{t.days}</h2>
        {byDay.map((d) => (
          <div key={d.id}>
            <h3>
              {d.label || day(locale, d.day)}
              {d.venue ? <span className="muted"> · {d.venue}</span> : null}
            </h3>
            <ul className="records public-matches">
              {d.matches.map((m) => (
                <li key={m.id}>
                  <strong>{m.score ? `${m.home} ${m.score.home} - ${m.score.away} ${m.away}` : `${m.home} - ${m.away}`}</strong>
                  <span className="muted">{m.kickoff ? ` · ${m.kickoff}` : ""}</span>
                  {m.corrected_at && <p className="small">{fill(t.corrected, { date: day(locale, m.corrected_at) })}</p>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      {x.scorers.length > 0 && (
        <section aria-labelledby="pt-scorers">
          <h2 id="pt-scorers">{t.scorers}</h2>
          <ol className="plain-list">
            {x.scorers.map((s, i) => (
              <li key={i}>{`${s.name} · ${s.goals}`}</li>
            ))}
          </ol>
        </section>
      )}
      <p className="muted small">{t.poweredBy}</p>
    </main>
  );
}
