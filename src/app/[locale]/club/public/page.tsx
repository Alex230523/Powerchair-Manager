import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Integrations } from "@/components/integrations";
export const metadata = { title: "Page publique · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Integrations locale={locale} />;
}
