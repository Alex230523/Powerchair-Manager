import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { PublicOpenEvent } from "@/components/open-event-public";
export const metadata = { title: "Inscription · Powerchair Football Manager", referrer: "no-referrer" as const };
/** B9, public: register to an open event without an account; with ?r=, one's own registration. */
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string; token: string }>; searchParams: Promise<{ r?: string }> }) {
  const { locale, token } = await params;
  const { r } = await searchParams;
  if (!isLocale(locale) || !/^[A-Za-z0-9_-]{32,64}$/.test(token)) notFound();
  return <PublicOpenEvent locale={locale} token={token} registration={r && /^[A-Za-z0-9_-]{30,64}$/.test(r) ? r : undefined} />;
}
