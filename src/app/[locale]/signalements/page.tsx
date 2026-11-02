import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { MyReports } from "@/components/feedback";
export const metadata = {
  title: "Mes signalements · Powerchair Football Manager",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <MyReports locale={locale} />;
}
