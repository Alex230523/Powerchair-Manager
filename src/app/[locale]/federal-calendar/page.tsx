import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { FederalCalendar } from "@/components/licenses";
export const metadata = {
  title: "Calendrier fédéral · Powerchair Football Manager",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <FederalCalendar locale={locale} />;
}
