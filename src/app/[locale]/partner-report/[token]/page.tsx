import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { PartnerReportPage } from "@/components/sponsors";
export const metadata = { title: "Bilan du partenariat · Powerchair Football Manager" };
/** Public report of a partnership, shared by the club (no account). */
export default async function Page({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  if (!isLocale(locale) || !/^[A-Za-z0-9_-]{20,40}$/.test(token)) notFound();
  return <PartnerReportPage locale={locale} token={token} />;
}
