import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { CircularsPage } from "@/components/circulars";
export const metadata = { title: "Circulaires · Powerchair Football Manager" };
/** 33: the federation's circulars, received (and written by its communication). */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <CircularsPage locale={locale} />;
}
