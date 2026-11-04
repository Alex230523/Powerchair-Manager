import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { ClubClassification } from "@/components/licenses";
export const metadata = { title: "Classification · Powerchair Football Manager" };
/** 1: the club's players' classification (the former « Licences » page). */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ClubClassification locale={locale} />;
}
