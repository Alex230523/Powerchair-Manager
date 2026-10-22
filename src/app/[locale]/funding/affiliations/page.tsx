import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { ClubAffiliations } from "@/components/affiliations";
export const metadata = { title: "Affiliations · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ClubAffiliations locale={locale} />;
}
