import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Settings } from "@/components/settings";
import { isSettingsCategory } from "@/components/settings-nav";
export const metadata = { title: "Réglages · Powerchair Football Manager" };
/** One settings category (wave 15): the panels of the former single page, grouped. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; category: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { locale, category } = await params;
  const { kind } = await searchParams;
  if (!isLocale(locale) || !isSettingsCategory(category)) notFound();
  // ?kind=documents opens the reminders on the documents (former /reminders?kind=, wave 17).
  return <Settings locale={locale} category={category} remindersKind={kind === "documents" ? "documents" : "dues"} />;
}
