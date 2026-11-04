import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { NewsPage } from "@/components/news";
export const metadata = {
  title: "Nouveautés · Powerchair Football Manager",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <NewsPage locale={locale} />;
}
