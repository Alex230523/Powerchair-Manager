import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { ClubFederation } from "@/components/club-federation";
export const metadata = { title: "Fédération · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ClubFederation locale={locale} />;
}
