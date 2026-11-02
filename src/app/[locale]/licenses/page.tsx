import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/locale";
/** 1: the former « Licences » page of the club is « Classification ». */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/classification`);
}
