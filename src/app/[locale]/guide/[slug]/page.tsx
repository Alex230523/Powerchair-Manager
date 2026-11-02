import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { GuideChapterPage } from "@/components/guide";
export const metadata = { title: "Guide du jeu · Powerchair Football Manager" };
/** One chapter of the guide (printable on A4), with the club's note « Chez nous ». */
export default async function Page({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !/^[a-z0-9-]{2,40}$/.test(slug)) notFound();
  return <GuideChapterPage locale={locale} slug={slug} />;
}
