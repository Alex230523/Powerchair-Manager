import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { MatchJourney } from "@/components/match-journey";
export const metadata = { title: "Fiche de match · Powerchair Football Manager" };
/** A5: one match, before / match day / after. */
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <MatchJourney locale={locale} id={id} />;
}
