import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { getDb } from "@/lib/db";
import { publicLive } from "@/domains/competitions/live-public";
import { PublicLivePage } from "@/components/public-live";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ locale: string; token: string }> };
const valid = (token: string) => /^[0-9a-f]{32}$/.test(token);
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, token } = await params;
  const x = isLocale(locale) && valid(token) ? await publicLive(getDb(), token).catch(() => null) : null;
  if (!x) return { title: "Powerchair Football Manager", robots: { index: false } };
  return { title: `${x.team} · ${x.opponent}`, description: x.club, robots: { index: false } };
}
/** Lot 3 (05/11/2026), public: a match followed live by the link the club shared. */
export default async function Page({ params }: Params) {
  const { locale, token } = await params;
  if (!isLocale(locale) || !valid(token)) notFound();
  const x = await publicLive(getDb(), token);
  if (!x) notFound();
  return <PublicLivePage locale={locale} token={token} initial={x} />;
}
