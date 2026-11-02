import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/locale";

/** 24: the messaging is retired; an old link goes home, with a short word. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}?info=messagerie`);
}
