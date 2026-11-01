import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { DonorIdentity } from "@/components/tax-donor";
export const metadata = { title: "Numéro national · Powerchair Football Manager", referrer: "no-referrer" as const };
/** B8, public: the donor gives their national number for the tax receipt. */
export default async function Page({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  if (!isLocale(locale) || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) notFound();
  return <DonorIdentity locale={locale} token={token} />;
}
