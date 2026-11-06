import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { ClassificationRegistry } from "@/components/classification-registry";
export const metadata = {
  title: "Registre des classifications · Powerchair Football Manager",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ClassificationRegistry locale={locale} />;
}
