import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { PlayerDirectory } from "@/components/player-directory";
export const metadata = { title: "Powerchair Football Manager · players" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ create?: string; import?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const query = await searchParams;
  return <PlayerDirectory locale={locale} role="player" former={false} create={query.create === "1"} importing={query.import === "1"} />;
}
