import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { FederationTeams } from "@/components/federation-teams";
export const metadata = { title: "Équipes de la fédération · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <FederationTeams locale={locale} />;
}
