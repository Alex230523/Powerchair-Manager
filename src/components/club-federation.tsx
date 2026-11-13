"use client";
import Link from "next/link";
import { useCallback } from "react";
import type { Locale } from "@/lib/locale";
import type { clubFederationView } from "@/domains/federation-page/service";
import { formatCents } from "@/domains/dashboard/summary";
import { clubFederationCopy } from "./club-federation-copy";
import { errors } from "./access-copy";
import { Badge, Card, EmptyState, KpiCard, PageHeader } from "./ui";
import { useData } from "./use-api";
import { Icon } from "./icons";

type View = Awaited<ReturnType<typeof clubFederationView>>;
type Full = Extract<View, { clubs: unknown }>;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (v[k] === undefined ? m : String(v[k])));
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/**
 * 12/11/2026: the « Fédération » page of a club. Circulars and discipline
 * left the side menu and live here, with the federation's tournaments, the
 * transfer news and one card per affiliated club.
 */
export function ClubFederation({ locale }: { locale: Locale }) {
  const t = clubFederationCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error } = useData<View>("/api/club/federation", failure);
  const day = (iso: string) => new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Brussels" }).format(new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso));
  if (!data) {
    return (
      <main id="main" className="club-federation">
        <PageHeader title={t.title} />
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  }
  if (!data.federation) {
    return (
      <main id="main" className="club-federation">
        <PageHeader title={t.title} />
        <EmptyState icon="landmark" title={t.none} />
        <p className="card-link-row">
          <Link className="button secondary" href={`/${locale}/settings/club`}>
            {t.noneAction}
          </Link>
        </p>
      </main>
    );
  }
  const v = data as Full;
  return (
    <main id="main" className="club-federation">
      <PageHeader
        title={v.federation.name}
        subtitle={fill(t.subtitle, { name: v.federation.name })}
        actions={
          v.federation.contact_email ? (
            <a className="button secondary" href={`mailto:${v.federation.contact_email}`}>
              {t.contact}
            </a>
          ) : undefined
        }
      />
      <div className="federation-grid">
        <Card title={t.circulars} icon="megaphone" labelledBy="fed-circulars" headingId="fed-circulars" actions={v.unread > 0 ? <Badge tone="warning">{fill(t.unread, { n: v.unread })}</Badge> : undefined}>
          {v.circulars.length ? (
            <ul className="federation-list">
              {v.circulars.map((x) => (
                <li key={x.id}>
                  <Link href={`/${locale}/circulars/${x.id}`} className={x.read_at ? undefined : "unread"}>
                    {x.title}
                  </Link>
                  <span className="muted small">
                    {day(x.sent_at)}
                    {x.ack_required && (x.acknowledged_at ? ` · ${t.acknowledged}` : ` · ${t.toAcknowledge}`)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t.circularsNone}</p>
          )}
          <p className="card-link-row">
            <Link className="button secondary" href={`/${locale}/circulars`}>
              {t.allCirculars}
            </Link>
          </p>
        </Card>

        <Card title={t.tournaments} icon="trophy" labelledBy="fed-tournaments" headingId="fed-tournaments">
          {v.tournaments.length ? (
            <ul className="federation-list">
              {v.tournaments.map((x) => (
                <li key={x.id}>
                  <Link href={`/${locale}/tournaments/${x.id}`}>{x.name}</Link>
                  <span className="muted small">
                    {x.next_day ? fill(t.nextDay, { day: day(x.next_day) }) : fill(t.days, { n: x.days })}
                    {x.venue ? ` · ${x.venue}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t.tournamentsNone}</p>
          )}
          <p className="card-link-row">
            <Link className="button secondary" href={`/${locale}/tournaments`}>
              {t.allTournaments}
            </Link>
          </p>
        </Card>

        <Card title={t.transfers} icon="handshake" labelledBy="fed-transfers" headingId="fed-transfers">
          {v.transfers.length ? (
            <ul className="federation-list">
              {v.transfers.map((x) => (
                <li key={x.id}>
                  <span>{x.from_club ? fill(t.moved, { name: x.name, from: x.from_club, to: x.to_club }) : fill(t.joined, { name: x.name, to: x.to_club })}</span>
                  <span className="muted small">{day(x.completed_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t.transfersNone}</p>
          )}
          <p className="card-link-row">
            <Link className="button secondary" href={`/${locale}/transfers`}>
              {t.market}
            </Link>
          </p>
        </Card>

        {v.discipline && (
          <Card title={t.discipline} icon="shield" labelledBy="fed-discipline" headingId="fed-discipline">
            <div className="federation-figures">
              <KpiCard label={t.sanctions} value={v.discipline.sanctions} icon="shield" tone="neutral" />
              <KpiCard label={t.appealable} value={v.discipline.appealable} icon="clock" tone={v.discipline.appealable ? "warning" : "neutral"} />
              <KpiCard label={t.finesDue} value={formatCents(v.discipline.fines_due, locale)} icon="dues" tone={v.discipline.fines ? "danger" : "neutral"} />
            </div>
            <p className="card-link-row">
              <Link className="button secondary" href={`/${locale}/discipline`}>
                {t.allDiscipline}
              </Link>
            </p>
          </Card>
        )}
      </div>

      <section className="federation-clubs" aria-labelledby="fed-clubs">
        <h2 id="fed-clubs">{t.clubs}</h2>
        <p className="muted">{fill(t.clubsIntro, { n: v.clubs.length })}</p>
        <ul className="federation-club-grid">
          {v.clubs.map((x) => (
            <li key={x.id} className="federation-club" data-mine={x.mine ? "" : undefined}>
              <div className="federation-club-head">
                {x.logo_version ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="federation-club-logo" src={`/api/club/logo?org=${x.id}&v=${x.logo_version}`} alt="" />
                ) : (
                  <span className="federation-club-logo" aria-hidden="true">
                    {initials(x.name)}
                  </span>
                )}
                <div>
                  <h3>{x.name}</h3>
                  <p className="muted small">
                    {[x.city, x.founded_year ? fill(t.founded, { year: x.founded_year }) : ""].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {x.mine && <Badge tone="info">{t.yours}</Badge>}
              </div>
              <dl className="federation-club-facts">
                <div>
                  <dt>{x.presidents.length > 1 ? t.presidents : t.president}</dt>
                  <dd>{x.presidents.length ? x.presidents.join(", ") : <span className="muted">{t.noPresident}</span>}</dd>
                </div>
                <div>
                  <dt className="sr-only">{t.hall}</dt>
                  <dd>
                    <Icon name="pin" size={14} /> {x.home ? fill(t.home, { name: x.home }) : <span className="muted">{t.noHome}</span>}
                  </dd>
                </div>
              </dl>
              {x.titles > 0 && (
                <p className="federation-club-hall">
                  <Icon name="trophy" size={14} /> {fill(t.titles, { n: x.titles })}
                  {x.last_title ? <span className="muted"> · {fill(t.lastTitle, { title: x.last_title })}</span> : null}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
