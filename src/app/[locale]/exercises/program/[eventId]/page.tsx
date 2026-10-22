import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { ProgramPrint } from "@/components/exercise-sheet";
export const metadata = { title: "Programme de l'entraînement · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string; eventId: string }> }) {
  const { locale, eventId } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/.test(eventId)) notFound();
  return <ProgramPrint locale={locale} eventId={eventId} />;
}
