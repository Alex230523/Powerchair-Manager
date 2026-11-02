import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { CircularPage } from "@/components/circulars";
export const metadata = { title: "Circulaire · Powerchair Football Manager" };
/** 33: one circular (read when opened), with « J'ai lu » and, for the federation, the follow-up by club. */
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <CircularPage locale={locale} id={id} />;
}
