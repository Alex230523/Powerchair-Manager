import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Designations } from "@/components/referees";
export const metadata = {
  title: "Désignations des arbitres · Powerchair Football Manager",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Designations locale={locale} />;
}
