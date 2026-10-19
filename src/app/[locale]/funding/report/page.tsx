import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { FinanceReport } from "@/components/finance-report";
export const metadata = {
  title: "Rapport financier · Powerchair Football Manager",
};
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { locale } = await params;
  const { season } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <FinanceReport locale={locale} season={season ?? ""} />;
}
