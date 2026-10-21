import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Grants } from "@/components/grants";
export const metadata = { title: "Subsides · Powerchair Football Manager" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ grant?: string; funder?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const q = await searchParams;
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  return <Grants locale={locale} start={{ grant: uuid(q.grant), funder: uuid(q.funder) }} />;
}
