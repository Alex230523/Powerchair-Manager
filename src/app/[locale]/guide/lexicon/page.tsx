import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { LexiconPage } from "@/components/knowledge";
export const metadata = { title: "Lexique · Powerchair Football Manager" };
/** G12: the lexicon of the federation's guide. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <LexiconPage locale={locale} />;
}
