import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Partners } from "@/components/funding-pages";
export const metadata = { title: "Sponsors et philanthropie · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Partners locale={locale} />;
}
