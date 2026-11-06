import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { SupportDesk } from "@/components/support";
export const metadata = {
  title: "Support · Powerchair Football Manager",
};
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <SupportDesk locale={locale} />;
}
