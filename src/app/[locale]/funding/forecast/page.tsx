import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Forecast } from "@/components/forecast";
export const metadata = { title: "Prévisions · Finances · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Forecast locale={locale} />;
}
