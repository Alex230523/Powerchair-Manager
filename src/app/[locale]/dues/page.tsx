import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Dues } from "@/components/dues";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Dues locale={locale} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return {
    title: `${locale === "fr" ? "Cotisations" : locale === "nl" ? "Bijdragen" : "Dues"} · Powerchair Football Manager`,
  };
}
