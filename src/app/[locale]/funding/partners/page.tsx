import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/locale";
/** A2: the sponsors are the « Sponsoring » view of « Subsides & sponsors ». */
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const q = await searchParams;
  const keep = new URLSearchParams({ vue: "sponsoring" });
  for (const k of ["partner", "new", "name", "note", "tab"]) if (typeof q[k] === "string") keep.set(k, q[k] as string);
  redirect(`/${locale}/funding/grants-sponsors?${keep}`);
}
