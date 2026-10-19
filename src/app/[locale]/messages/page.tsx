import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Messages } from "@/components/messages";
export const metadata = { title: "Messagerie · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Messages locale={locale} />;
}
