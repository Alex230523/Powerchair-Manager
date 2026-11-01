import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { getDb } from "@/lib/db";
import { publicClub } from "@/domains/integrations/public";
import { NextMatches, Results, Standings } from "@/components/public-club";
import { publicCopy } from "@/components/public-copy";
export const dynamic = "force-dynamic";
export const metadata = { title: "Widget", robots: { index: false } };
/** B6: a widget of the club's public page, embedded in its website (frame-ancestors *, no account). */
export default async function Page({ params }: { params: Promise<{ locale: string; slug: string; kind: string }> }) {
  const { locale, slug, kind } = await params;
  if (!isLocale(locale) || !/^[a-z0-9-]{3,60}$/.test(slug) || !["next", "results", "standings"].includes(kind)) notFound();
  const club = await publicClub(getDb(), slug);
  if (!club) notFound();
  const t = publicCopy[locale].page;
  const title = kind === "next" ? t.nextMatches : kind === "results" ? t.results : t.standings;
  return (
    <main id="main" className="widget public-widget">
      <h1>
        {title} · {club.name}
      </h1>
      {kind === "next" && <NextMatches locale={locale} club={club} limit={1} />}
      {kind === "results" && <Results locale={locale} club={club} limit={5} />}
      {kind === "standings" && (club.standings.length ? club.standings.map((s) => <Standings key={s.id} locale={locale} tables={s.tables} title={`${s.name} ${s.year}`} />) : <p className="muted">{t.noResults}</p>)}
    </main>
  );
}
