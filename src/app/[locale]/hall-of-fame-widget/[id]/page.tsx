import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { getDb } from "@/lib/db";
import { publicHallOfFame } from "@/domains/awards/service";
import { medalOf } from "@/domains/awards/schema";
import { fill, placeLabel, statisticsCopy } from "@/components/statistics-copy";
import { Icon } from "@/components/icons";
export const dynamic = "force-dynamic";
export const metadata = { title: "Hall of fame", robots: { index: false } };

/**
 * Wave 16 (S1): the club's public Hall of fame, to embed in its website (like
 * the registration widget: frame-ancestors *, no account). A person's prize
 * appears only with « Peut être publié », a photo likewise.
 */
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const w = statisticsCopy[locale].awards;
  const hall = await publicHallOfFame(getDb(), id, w.noSeason).catch(() => null);
  if (!hall) notFound();
  const day = (d: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  return (
    <main id="main" className="widget hall-widget">
      <div className="club-banner">
        {hall.club.logo_version && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="club-banner-logo" src={`/api/club/logo?hall=${id}&v=${hall.club.logo_version}`} alt={hall.club.name} />
        )}
        <div>
          <h1>{w.title}</h1>
          <p>{hall.club.name}</p>
        </div>
      </div>
      {!hall.seasons.length && <p>{w.publicEmpty}</p>}
      <ol className="award-timeline">
        {hall.seasons.map((g) => (
          <li key={g.season}>
            <h2 className="award-season">{g.season}</h2>
            <ul className="award-list">
              {g.items.map((a) => (
                <li key={a.id}>
                  <article className="award" aria-labelledby={`award-${a.id}`}>
                    <p className="award-place">
                      <span className="medal" data-medal={medalOf(a.place)} aria-hidden="true">
                        <Icon name={medalOf(a.place) === "star" ? "star" : "medal"} size={18} />
                      </span>
                      {placeLabel(w, a.place, locale)}
                    </p>
                    <h3 id={`award-${a.id}`} className="award-title">
                      {a.title}
                    </h3>
                    {a.competition && <p className="muted small">{a.competition}</p>}
                    <p className="award-meta small">
                      {a.team && (
                        <span className="team-chip" data-color={a.team_color ?? undefined}>
                          <span className="team-dot" aria-hidden="true" />
                          {a.team}
                        </span>
                      )}
                      {a.person && <span>{a.person}</span>}
                      <span className="muted">{day(a.awarded_on)}</span>
                    </p>
                    {a.has_photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="award-photo" src={`/api/hall-of-fame/${id}/${a.id}?v=${a.version}`} alt={fill(w.photoAlt, { title: a.title })} loading="lazy" />
                    )}
                  </article>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </main>
  );
}
