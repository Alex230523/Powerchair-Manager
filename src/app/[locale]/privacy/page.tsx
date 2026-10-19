import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Privacy } from "@/components/privacy";
export const metadata = {
  title: "Données personnelles · Powerchair Football Manager",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Privacy locale={locale} />;
}
