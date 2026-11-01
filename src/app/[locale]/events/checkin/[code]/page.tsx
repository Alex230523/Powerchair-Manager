import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { OpenEventCheckin } from "@/components/open-events";
export const metadata = { title: "Pointage · Powerchair Football Manager", referrer: "no-referrer" as const };
/** B9: the page a registration's QR code opens on the staff's phone. */
export default async function Page({ params }: { params: Promise<{ locale: string; code: string }> }) {
  const { locale, code } = await params;
  if (!isLocale(locale) || !/^[A-Za-z0-9_-]{20,64}$/.test(code)) notFound();
  return <OpenEventCheckin locale={locale} code={code} />;
}
