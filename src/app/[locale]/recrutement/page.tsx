import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Recruitment } from "@/components/recruitment";
export const metadata = { title: "Recrutement · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Recruitment locale={locale} />;
}
