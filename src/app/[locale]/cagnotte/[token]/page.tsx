import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { publicAppearance } from "@/lib/appearance";
import { ClubPalette } from "@/components/club-palette";
import { PublicPot } from "@/components/fundraising";
export const metadata = { title: "Cagnotte · Powerchair Football Manager" };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  if (!isLocale(locale) || !/^[A-Za-z0-9_-]{20,40}$/.test(token)) notFound();
  return (
    <>
      <ClubPalette appearance={await publicAppearance("pot", token)} />
      <PublicPot locale={locale} token={token} />
    </>
  );
}
