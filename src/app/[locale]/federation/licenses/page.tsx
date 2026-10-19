import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { FederationLicenses } from "@/components/licenses";
export const metadata = {
  title: "Licences et classifications · Powerchair Football Manager",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <FederationLicenses locale={locale} />;
}
