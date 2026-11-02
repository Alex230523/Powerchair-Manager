import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/locale";
/** 12: personal data are a category of Réglages (« Mes données », and the club's for whom may see them). */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/settings/data`);
}
