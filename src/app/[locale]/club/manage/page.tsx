import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/locale";
/** 12: « Gestion du club » is gone: identity and modules in Réglages › Club, seasons in Réglages › Saisons, colours on Équipes. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/settings/club`);
}
