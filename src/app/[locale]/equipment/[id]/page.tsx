import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { ChairPage } from "@/components/chair-sheet";
export const metadata = { title: "Fiche fauteuil · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <ChairPage locale={locale} id={id} />;
}
