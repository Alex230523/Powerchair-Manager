import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { TripsPage } from "@/components/trips";
export const metadata = { title: "Déplacements · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <TripsPage locale={locale} />;
}
