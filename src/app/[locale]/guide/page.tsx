import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { GuideIndex } from "@/components/guide";
export const metadata = { title: "Guide du jeu · Powerchair Football Manager" };
/** Guide du powerchair football: the chapters of the federation, for every profile. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <GuideIndex locale={locale} />;
}
