import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { TournamentDetail } from "@/components/tournament-detail";
export const metadata = { title: "Tournoi · Powerchair Football Manager" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !uuid.test(id)) notFound();
  return <TournamentDetail locale={locale} id={id} />;
}
