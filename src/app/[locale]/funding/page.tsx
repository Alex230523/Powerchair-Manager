import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Finance } from "@/components/finance";
export const metadata = { title: "Finance du club · Powerchair Football Manager" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ create?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { create } = await searchParams;
  return <Finance locale={locale} create={create === "1"} />;
}
