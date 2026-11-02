import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { PollLink } from "@/components/polls";
export const metadata = { title: "Sondage · Powerchair Football Manager", referrer: "no-referrer" as const };
/** H3, public: answer a poll from the personal link, without signing in, once. */
export default async function Page({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  if (!isLocale(locale) || !/^[A-Za-z0-9_-]{30,40}$/.test(token)) notFound();
  return <PollLink locale={locale} token={token} />;
}
