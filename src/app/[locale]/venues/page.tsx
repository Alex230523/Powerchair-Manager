import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Venues } from "@/components/venues";
export const metadata = { title: "Lieux · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Venues locale={locale} />;
}
