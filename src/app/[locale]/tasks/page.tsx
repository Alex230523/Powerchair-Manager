import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { FundingTasks } from "@/components/sponsors";
export const metadata = { title: "Tâches des sponsors et subsides · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <FundingTasks locale={locale} />;
}
