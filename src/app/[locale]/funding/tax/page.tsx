import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { TaxReceipts } from "@/components/tax";
export const metadata = { title: "Attestations fiscales · Finances · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <TaxReceipts locale={locale} />;
}
