import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { ChairCatalogue } from "@/components/knowledge";
export const metadata = { title: "Catalogue des fauteuils · Powerchair Football Manager" };
/** G4: one sheet per validated chair model. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ChairCatalogue locale={locale} />;
}
