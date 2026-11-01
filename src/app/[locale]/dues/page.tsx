import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Dues } from "@/components/dues";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ team?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // A6: « ?team= » opens the issue wizard on that team.
  const { team } = await searchParams;
  return <Dues locale={locale} issueTeam={team && /^[0-9a-f-]{36}$/i.test(team) ? team : undefined} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return {
    title: `${locale === "fr" ? "Cotisations" : locale === "nl" ? "Bijdragen" : "Dues"} · Powerchair Football Manager`,
  };
}
