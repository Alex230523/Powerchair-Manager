import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { OrganizationBilling } from "@/components/organization-billing";
export const metadata = {
  title: "Abonnement à la plateforme · Powerchair Football Manager",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <OrganizationBilling locale={locale} />;
}
