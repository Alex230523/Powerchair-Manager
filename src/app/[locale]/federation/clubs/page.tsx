import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { FederationClubs } from "@/components/federation-clubs";
export const metadata = {
  title: "Clubs affiliés · Powerchair Football Manager",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <FederationClubs locale={locale} />;
}
