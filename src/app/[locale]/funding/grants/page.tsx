import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Grants } from "@/components/funding-pages";
export const metadata = { title: "Subsides · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Grants locale={locale} />;
}
