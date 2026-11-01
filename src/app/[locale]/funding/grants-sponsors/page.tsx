import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Grants } from "@/components/grants";
import { Partners } from "@/components/funding-pages";
export const metadata = { title: "Subsides & sponsors · Powerchair Football Manager" };
const uuid = /^[0-9a-f-]{36}$/i;
/**
 * A2: grants and sponsors in one page, two views; the view is in the
 * address (?vue=subsides|sponsoring). ?grant= and ?funder= open a grant or
 * a funder; ?partner= a sponsor; ?new=1&name=…&note=… prefills a sponsor
 * (from a pot); ?tab=packages opens the packages.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const q = await searchParams;
  const one = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : undefined);
  const id = (k: string) => (uuid.test(one(k) ?? "") ? one(k) : undefined);
  if (one("vue") === "sponsoring")
    return (
      <Partners
        locale={locale}
        start={{
          partner: id("partner"),
          name: one("new") === "1" ? one("name")?.slice(0, 160) : undefined,
          note: one("new") === "1" ? one("note")?.slice(0, 400) : undefined,
          tab: one("tab") === "packages" ? "packages" : undefined,
        }}
      />
    );
  return <Grants locale={locale} start={{ grant: id("grant"), funder: id("funder") }} />;
}
