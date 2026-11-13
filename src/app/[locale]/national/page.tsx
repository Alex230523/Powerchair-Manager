import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { NationalStaff } from "@/components/national-staff";
export const metadata = { title: "Équipe nationale · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <NationalStaff locale={locale} />;
}
