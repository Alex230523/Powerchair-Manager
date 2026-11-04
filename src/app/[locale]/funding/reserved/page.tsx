import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { ReservedFunds } from "@/components/reserved-funds";
export const metadata = { title: "Fonds réservés · Finances · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ReservedFunds locale={locale} />;
}
