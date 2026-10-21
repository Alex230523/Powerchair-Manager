import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { FundingTasks } from "@/components/sponsors";
export const metadata = { title: "Tâches des sponsors et subsides · Powerchair Football Manager" };
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ kind?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { kind } = await searchParams;
  return <FundingTasks locale={locale} kind={kind === "grant" || kind === "partner" ? kind : "all"} />;
}
