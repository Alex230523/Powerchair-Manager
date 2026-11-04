import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { ClubDiscipline } from "@/components/discipline";
export const metadata = {
  title: "Discipline · Powerchair Football Manager",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ClubDiscipline locale={locale} />;
}
