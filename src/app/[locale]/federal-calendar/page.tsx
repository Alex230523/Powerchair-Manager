import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/locale";
/** The federation calendar became the tournaments page (21 October 2026). */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/tournaments`);
}
