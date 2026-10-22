import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { BankStatements } from "@/components/bank-statements";
export const metadata = { title: "Relevés de compte · Finances · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <BankStatements locale={locale} />;
}
