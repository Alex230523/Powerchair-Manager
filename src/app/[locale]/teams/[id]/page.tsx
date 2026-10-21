import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { TeamSheet } from "@/components/teams";
export const metadata = { title: "Équipe · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  return <TeamSheet locale={locale} id={id} />;
}
