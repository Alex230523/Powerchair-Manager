import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Attestations } from "@/components/attestations";
export const metadata = { title: "Attestations mutuelle · Powerchair Football Manager" };
const uuid = /^[0-9a-f-]{36}$/i;
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ season?: string; profile?: string }>;
}) {
  const { locale } = await params;
  const { season, profile } = await searchParams;
  if (!isLocale(locale)) notFound();
  return (
    <Attestations
      locale={locale}
      season={season && uuid.test(season) ? season : ""}
      profile={profile && uuid.test(profile) ? profile : ""}
    />
  );
}
