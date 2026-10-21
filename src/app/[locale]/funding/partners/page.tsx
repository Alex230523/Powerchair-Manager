import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Partners } from "@/components/funding-pages";
export const metadata = { title: "Sponsors et philanthropie · Powerchair Football Manager" };
const uuid = /^[0-9a-f-]{36}$/i;
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const q = await searchParams;
  const one = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : undefined);
  // ?partner=ID opens a sheet (calendar, home, tasks); ?new=1&name=…&note=… prefills a partner (from a pot).
  return (
    <Partners
      locale={locale}
      start={{
        partner: uuid.test(one("partner") ?? "") ? one("partner") : undefined,
        name: one("new") === "1" ? one("name")?.slice(0, 160) : undefined,
        note: one("new") === "1" ? one("note")?.slice(0, 400) : undefined,
        tab: one("tab") === "packages" ? "packages" : undefined,
      }}
    />
  );
}
