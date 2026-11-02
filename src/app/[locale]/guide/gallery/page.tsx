import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { GalleryPage } from "@/components/knowledge";
export const metadata = { title: "Galerie · Powerchair Football Manager" };
/** G5: photos and annotated diagrams of the court and the equipment. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <GalleryPage locale={locale} />;
}
