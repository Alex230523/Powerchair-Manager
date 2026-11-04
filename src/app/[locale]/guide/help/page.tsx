import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { HelpIndex } from "@/components/knowledge";
export const metadata = { title: "Mode d'emploi · Powerchair Football Manager" };
/** G10: the how-to sheets, by role. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <HelpIndex locale={locale} />;
}
