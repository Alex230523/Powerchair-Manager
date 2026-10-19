import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { RefereeSpace } from "@/components/referees";
export const metadata = {
  title: "Espace arbitre · Powerchair Football Manager",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <RefereeSpace locale={locale} />;
}
