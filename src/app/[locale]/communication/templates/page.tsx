import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { MailTemplates } from "@/components/mail-templates";
export const metadata = { title: "Modèles d'emails · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <MailTemplates locale={locale} />;
}
