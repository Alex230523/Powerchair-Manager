import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { PollsPage } from "@/components/polls";
export const metadata = { title: "Sondages · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <PollsPage locale={locale} />;
}
