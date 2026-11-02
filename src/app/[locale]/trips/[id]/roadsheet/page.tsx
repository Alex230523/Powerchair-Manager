import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { TripRoadSheet } from "@/components/trip-roadsheet";
export const metadata = { title: "Feuille de route · Powerchair Football Manager" };
/** 3 (9): the road sheet of a trip, printable and readable on a phone. */
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <TripRoadSheet locale={locale} id={id} />;
}
