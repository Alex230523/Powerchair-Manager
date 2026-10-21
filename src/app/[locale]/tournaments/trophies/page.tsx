import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Trophies } from "@/components/trophies";
export const metadata = { title: "Galerie des trophées · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Trophies locale={locale} />;
}
