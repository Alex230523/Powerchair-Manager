import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { CoachProfile } from "@/components/coach-profile";
export const metadata = { title: "Fiche coach · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <CoachProfile locale={locale} id={id} />;
}
