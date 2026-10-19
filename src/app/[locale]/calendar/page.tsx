import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Calendar } from "@/components/calendar";
export const metadata = { title: "Calendrier · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Calendar locale={locale} />;
}
