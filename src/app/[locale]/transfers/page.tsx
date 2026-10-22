import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Transfers } from "@/components/transfers";
export const metadata = { title: "Bourse aux transferts · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Transfers locale={locale} />;
}
