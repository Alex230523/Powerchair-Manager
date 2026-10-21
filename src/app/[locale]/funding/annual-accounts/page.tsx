import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { AnnualAccounts } from "@/components/annual-accounts";
export const metadata = { title: "Comptes annuels · Powerchair Football Manager" };
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ year?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { year } = await searchParams;
  return <AnnualAccounts locale={locale} year={year && /^\d{4}-\d{2}-\d{2}$/.test(year) ? year : undefined} />;
}
