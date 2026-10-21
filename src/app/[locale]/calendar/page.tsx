import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Calendar } from "@/components/calendar";
export const metadata = { title: "Calendrier · Powerchair Football Manager" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ event?: string; create?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { event, create } = await searchParams;
  // Opened from the dashboard: the event sheet is shown and its day focused.
  const eventId = event && /^[0-9a-f-]{36}$/.test(event) ? event : undefined;
  return <Calendar locale={locale} eventId={eventId} create={create === "1"} />;
}
