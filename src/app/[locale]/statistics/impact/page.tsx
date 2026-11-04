import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Impact } from "@/components/impact";
export const metadata = { title: "Rapport d'impact · Powerchair Football Manager" };
const day = /^\d{4}-\d{2}-\d{2}$/,
  uuid = /^[0-9a-f-]{36}$/i;
/** H13: ?from=&to= a period (a season, a year, a grant's), ?grant= the grant it is for. */
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const q = await searchParams;
  const one = (k: string, re: RegExp) => (typeof q[k] === "string" && re.test(q[k] as string) ? (q[k] as string) : undefined);
  return <Impact locale={locale} start={{ from: one("from", day), to: one("to", day), grant: one("grant", uuid) }} />;
}
