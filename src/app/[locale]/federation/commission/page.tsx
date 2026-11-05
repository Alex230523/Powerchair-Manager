import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Commission } from "@/components/commission";
export const metadata = {
  title: "Commission · Powerchair Football Manager",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Commission locale={locale} />;
}
