import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Exercises } from "@/components/exercises";
export const metadata = { title: "Fiches exercices · Powerchair Football Manager" };
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ genre?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // 4: « ?genre=tactic » opens the library on the tactics.
  return <Exercises locale={locale} genre={(await searchParams).genre} />;
}
