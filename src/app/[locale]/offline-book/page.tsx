import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { OfflineBook } from "@/components/offline-book";
export const metadata = { title: "Carnet hors ligne · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <OfflineBook locale={locale} />;
}
