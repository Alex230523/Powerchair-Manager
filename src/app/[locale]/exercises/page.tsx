import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Exercises } from "@/components/exercises";
export const metadata = { title: "Fiches exercices · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Exercises locale={locale} />;
}
