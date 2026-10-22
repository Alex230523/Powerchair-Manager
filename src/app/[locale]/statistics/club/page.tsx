import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { StatisticsClub } from "@/components/statistics";
export const metadata = { title: "Statistiques · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // The periods of the charts live in the address (useSearchParams): a Suspense boundary, as Next asks.
  return (
    <Suspense>
      <StatisticsClub locale={locale} />
    </Suspense>
  );
}
