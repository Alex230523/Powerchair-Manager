import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/locale";

/** 12/11/2026: the platform's subscription lives in Réglages; old links (invoices, notices) land there. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/settings/subscription`);
}
