import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Family } from "@/components/family";
export const metadata = { title: "Ma famille · Powerchair Football Manager" };
/** 27 to 29: the parents' space, every child of every club. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Family locale={locale} />;
}
