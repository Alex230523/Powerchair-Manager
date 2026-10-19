import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Equipment } from "@/components/equipment";
export const metadata = { title: "Matériel · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Equipment locale={locale} />;
}
