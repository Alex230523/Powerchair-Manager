import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Matches } from "@/components/matches";
export const metadata = { title: "Matchs · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Matches locale={locale} />;
}
