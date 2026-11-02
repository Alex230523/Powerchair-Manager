import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { ChairModelPage } from "@/components/knowledge";
export const metadata = { title: "Catalogue des fauteuils · Powerchair Football Manager" };
/** G4: a chair model's sheet (photos, maker, suppliers, price, features). */
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <ChairModelPage locale={locale} id={id} />;
}
