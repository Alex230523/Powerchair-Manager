import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { StatisticsGame } from "@/components/statistics-game";
export const metadata = { title: "Statistiques de jeu · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // The periods of the cards live in the address (useSearchParams): a Suspense boundary, as Next asks.
  return (
    <Suspense>
      <StatisticsGame locale={locale} />
    </Suspense>
  );
}
