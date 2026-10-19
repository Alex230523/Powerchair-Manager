import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Notifications } from "@/components/notifications";
export const metadata = {
  title: "Notifications · Powerchair Football Manager",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Notifications locale={locale} />;
}
