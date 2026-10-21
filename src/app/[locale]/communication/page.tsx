import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Communication } from "@/components/communication";
export const metadata = { title: "Communication · Powerchair Football Manager" };
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
  const eventId =
    event && /^[0-9a-f-]{36}$/.test(event) ? event : undefined;
  return <Communication locale={locale} eventId={eventId} create={create === "1"} />;
}
