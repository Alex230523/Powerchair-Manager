import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Statistics } from "@/components/statistics";
export const metadata = { title: "Statistiques · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Statistics locale={locale} />;
}
