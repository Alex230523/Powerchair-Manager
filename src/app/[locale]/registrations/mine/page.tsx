import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Registrations } from "@/components/registrations";
export const metadata = { title: "Inscriptions · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Registrations locale={locale} mode="mine" />;
}
