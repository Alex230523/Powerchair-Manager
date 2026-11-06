import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { FederationPolicy } from "@/components/federation-policy";
export const metadata = {
  title: "Règlement · Powerchair Football Manager",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <FederationPolicy locale={locale} />;
}
