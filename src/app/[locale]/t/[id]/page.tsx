import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { getDb } from "@/lib/db";
import { publicTournament } from "@/domains/integrations/public";
import { PublicTournament } from "@/components/public-club";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ locale: string; id: string }> };
const valid = (id: string) => /^[0-9a-f-]{36}$/.test(id);
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, id } = await params;
  const x = isLocale(locale) && valid(id) ? await publicTournament(getDb(), id).catch(() => null) : null;
  if (!x) return { title: "Powerchair Football Manager", robots: { index: false } };
  return { title: `${x.name} ${x.year}`, description: `${x.name} ${x.year} · ${x.owner}`, openGraph: { title: `${x.name} ${x.year}`, description: x.owner, type: "website", url: `/${locale}/t/${id}` } };
}
/** B6, public: a tournament's calendar, validated results and standings. */
export default async function Page({ params }: Params) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !valid(id)) notFound();
  const x = await publicTournament(getDb(), id);
  if (!x) notFound();
  return <PublicTournament locale={locale} tournament={x} />;
}
