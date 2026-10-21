import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Tournaments } from "@/components/tournaments";
export const metadata = { title: "Tournois · Powerchair Football Manager" };
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ year?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const asked = Number((await searchParams).year);
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : new Date().getFullYear();
  return <Tournaments locale={locale} initialYear={year} />;
}
