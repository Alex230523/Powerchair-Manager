import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Settings } from "@/components/settings";
import { isSettingsCategory } from "@/components/settings-nav";
export const metadata = { title: "Réglages · Powerchair Football Manager" };
/** One settings category (wave 15): the panels of the former single page, grouped. */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; category: string }>;
}) {
  const { locale, category } = await params;
  if (!isLocale(locale) || !isSettingsCategory(category)) notFound();
  return <Settings locale={locale} category={category} />;
}
