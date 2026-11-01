import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { OpenEvents } from "@/components/open-events";
export const metadata = { title: "Événements ouverts · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <OpenEvents locale={locale} />;
}
