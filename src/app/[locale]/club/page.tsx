import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { People } from "@/components/people";
export const metadata = { title: "Club · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <People locale={locale} />;
}
