import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Access } from "@/components/access";
export const metadata = { title: "Accès · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Access locale={locale} />;
}
