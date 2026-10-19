import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Courses } from "@/components/courses";
export const metadata = {
  title: "Formations des coachs · Powerchair Football Manager",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Courses locale={locale} />;
}
