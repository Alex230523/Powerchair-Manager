import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { GuidePublicPage } from "@/components/guide";
export const metadata = { title: "Guide du jeu · Powerchair Football Manager", referrer: "no-referrer" as const };
/** Public: a chapter the federation opened (discovery days, new parents), without an account. */
export default async function Page({ params }: { params: Promise<{ locale: string; federation: string; slug: string }> }) {
  const { locale, federation, slug } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/i.test(federation) || !/^[a-z0-9-]{2,40}$/.test(slug)) notFound();
  return <GuidePublicPage locale={locale} federation={federation} slug={slug} />;
}
