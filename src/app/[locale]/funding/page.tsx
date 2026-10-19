import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Finance } from "@/components/finance";
export const metadata = { title: "Financement · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Finance locale={locale} />;
}
