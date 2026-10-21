import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Contacts } from "@/components/contacts";
export const metadata = { title: "Carnet de contacts · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Contacts locale={locale} />;
}
