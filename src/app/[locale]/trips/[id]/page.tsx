import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { TripPage } from "@/components/trips";
export const metadata = { title: "Déplacement · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <TripPage locale={locale} id={id} />;
}
