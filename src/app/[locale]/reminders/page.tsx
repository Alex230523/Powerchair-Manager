import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/locale";

/** Wave 17 (G3): the reminders live in Settings > Notifications; the former address leads there. */
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ kind?: string }> }) {
  const { locale } = await params;
  const { kind } = await searchParams;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/settings/notifications${kind === "documents" || kind === "dues" ? `?kind=${kind}` : ""}#settings-reminders`);
}
