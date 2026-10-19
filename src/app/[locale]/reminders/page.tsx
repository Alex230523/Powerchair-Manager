import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Reminders } from "@/components/reminders";
export const metadata = { title: "Relances · Powerchair Football Manager" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { locale } = await params;
  const { kind } = await searchParams;
  if (!isLocale(locale)) notFound();
  return (
    <Reminders
      locale={locale}
      initial={kind === "documents" ? "documents" : "dues"}
    />
  );
}
