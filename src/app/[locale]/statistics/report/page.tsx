import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { ActivityReportPage } from "@/components/activity-report";
export const metadata = { title: "Rapport d’activité · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ActivityReportPage locale={locale} />;
}
