import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Registrations } from "@/components/registrations";
export const metadata = { title: "Inscriptions · Powerchair Football Manager" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id?: string }>;
  searchParams: Promise<{ guest?: string }>;
}) {
  const { locale, id } = await params;
  const { guest } = await searchParams;
  if (!isLocale(locale)) notFound();
  return (
    <Registrations
      locale={locale}
      mode="public"
      formId={id}
      guest={guest && /^[A-Za-z0-9_-]{40,60}$/.test(guest) ? guest : undefined}
    />
  );
}
