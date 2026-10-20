import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Rollover } from "@/components/rollover";
export const metadata = { title: "Passage de saison · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Rollover locale={locale} />;
}
