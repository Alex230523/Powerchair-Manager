import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { FederationTeamPage } from "@/components/circulars";
export const metadata = { title: "Équipe fédérale · Powerchair Football Manager" };
/** 32: the federation presidency's delegates and their roles. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <FederationTeamPage locale={locale} />;
}
