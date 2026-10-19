import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Attendance } from "@/components/attendance";
export const metadata = { title: "Présences · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Attendance locale={locale} />;
}
