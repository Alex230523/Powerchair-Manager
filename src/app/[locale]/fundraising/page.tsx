import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Fundraising } from "@/components/fundraising";
export const metadata = { title: "Levée de fonds · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Fundraising locale={locale} />;
}
