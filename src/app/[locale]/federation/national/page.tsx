import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { NationalTeams } from "@/components/national";
export const metadata = { title: "Équipes nationales · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <NationalTeams locale={locale} />;
}
