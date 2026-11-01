import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Finance } from "@/components/finance";
export const metadata = { title: "Opérations · Finances · Powerchair Football Manager" };
/** Wave 17 (N1): the ledger, its own tab of « Finances ». */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Finance locale={locale} section="operations" />;
}
