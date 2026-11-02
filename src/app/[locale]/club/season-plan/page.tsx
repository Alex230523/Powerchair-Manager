import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { SeasonPlan } from "@/components/season-plan";
export const metadata = { title: "Préparer la saison suivante · Powerchair Football Manager" };
/** 16: the yearly assistant, for the club's presidency. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <SeasonPlan locale={locale} />;
}
