import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { SeasonSchedule } from "@/components/season-schedule";
export const metadata = { title: "Planifier la saison · Powerchair Football Manager" };
/** H9: the season planner, holidays of reference and closures. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <SeasonSchedule locale={locale} />;
}
