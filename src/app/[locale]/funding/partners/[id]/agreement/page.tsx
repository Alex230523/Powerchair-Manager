import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Agreement } from "@/components/agreement";
export const metadata = { title: "Convention de partenariat · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <Agreement locale={locale} id={id} />;
}
