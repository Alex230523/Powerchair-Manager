import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Documents } from "@/components/documents";
export const metadata = { title: "Documents · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Documents locale={locale} />;
}
