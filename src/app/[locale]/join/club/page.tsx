import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { JoinClub } from "@/components/join-club";
export const metadata = { title: "Ouvrir mon club · Powerchair Football Manager" };
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ confirm?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { confirm } = await searchParams;
  return <JoinClub locale={locale} confirm={typeof confirm === "string" && /^[a-f0-9]{64}$/.test(confirm) ? confirm : null} />;
}
