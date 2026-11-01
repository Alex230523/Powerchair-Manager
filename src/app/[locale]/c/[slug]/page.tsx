import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { getDb } from "@/lib/db";
import { publicClub } from "@/domains/integrations/public";
import { PublicClub } from "@/components/public-club";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ locale: string; slug: string }> };
const valid = (slug: string) => /^[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])$/.test(slug);
/** B6: titles and Open Graph cards for sharing (the club's logo as the image). */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params;
  const club = isLocale(locale) && valid(slug) ? await publicClub(getDb(), slug).catch(() => null) : null;
  if (!club) return { title: "Powerchair Football Manager", robots: { index: false } };
  const description = (club.intro || club.name).slice(0, 200);
  return {
    title: `${club.name} · Powerchair Football`,
    description,
    alternates: { languages: { fr: `/fr/c/${slug}`, nl: `/nl/c/${slug}`, en: `/en/c/${slug}` } },
    openGraph: { title: club.name, description, type: "website", url: `/${locale}/c/${slug}`, ...(club.logo ? { images: [{ url: `/api/public/club/${slug}` }] } : {}) },
  };
}
/** B6, public: the club's page, when it chose to publish it. */
export default async function Page({ params }: Params) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !valid(slug)) notFound();
  const club = await publicClub(getDb(), slug);
  if (!club) notFound();
  return <PublicClub locale={locale} slug={slug} club={club} />;
}
