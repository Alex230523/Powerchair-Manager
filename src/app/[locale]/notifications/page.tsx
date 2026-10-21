import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/locale";
/** The notifications page lives in Settings since wave 15; old links and emails still land there. */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/settings/notifications`);
}
