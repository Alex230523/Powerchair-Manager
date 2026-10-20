import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Unsubscribe } from "@/components/unsubscribe";
export const metadata = { title: "Désinscription · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  return <Unsubscribe locale={locale} id={id} />;
}
