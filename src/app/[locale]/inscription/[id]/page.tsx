import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { publicAppearance } from "@/lib/appearance";
import { ClubPalette } from "@/components/club-palette";
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
    <>
    {id && /^[0-9a-f-]{36}$/.test(id) && <ClubPalette appearance={await publicAppearance("form", id)} />}
    <Registrations
      locale={locale}
      mode="public"
      formId={id}
      guest={guest && /^[A-Za-z0-9_-]{40,60}$/.test(guest) ? guest : undefined}
    />
    </>
  );
}
