import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/locale";

/** Wave 16 (S1): the statistics open on the « Club » tab, keeping the season and team of the address. */
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") q.set(k, v);
  redirect(`/${locale}/statistics/club${q.size ? "?" + q : ""}`);
}
