import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Settings } from "@/components/settings";
export const metadata = { title: "Réglages · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Settings locale={locale} />;
}
