import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { PlayerDirectory } from "@/components/player-directory";
export const metadata = {
  title: "Powerchair Football Manager · coaches/former",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <PlayerDirectory locale={locale} role="coach" former={true} />;
}
