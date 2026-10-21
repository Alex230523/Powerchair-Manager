import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { ClubLicenses } from "@/components/licenses";
export const metadata = { title: "Transferts · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ClubLicenses locale={locale} />;
}
