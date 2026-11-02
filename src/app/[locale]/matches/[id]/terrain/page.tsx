import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Sideline } from "@/components/sideline";
export const metadata = { title: "Bord de terrain · Powerchair Football Manager" };
/** 14: the match day on a phone, by the pitch. */
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <Sideline locale={locale} id={id} />;
}
