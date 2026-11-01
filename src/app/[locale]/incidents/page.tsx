import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Incidents } from "@/components/incidents";
export const metadata = { title: "Incidents · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Incidents locale={locale} />;
}
