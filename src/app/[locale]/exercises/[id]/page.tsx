import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { ExerciseSheet } from "@/components/exercise-sheet";
export const metadata = { title: "Fiche exercice · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  return <ExerciseSheet locale={locale} id={id} />;
}
