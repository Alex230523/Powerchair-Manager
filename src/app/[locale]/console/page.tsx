import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Console } from "@/components/console";
export const metadata = {
  title: "Console · Powerchair Football Manager",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Console locale={locale} />;
}
