import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Tasks } from "@/components/tasks";
import { taskKinds, type TaskKind } from "@/domains/tasks/schema";
export const metadata = { title: "Tâches · Powerchair Football Manager" };
/** Wave 17 (O1): every task of the club by type; « ?kind=partner » of wave 15 still opens the sponsors. */
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ kind?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { kind } = await searchParams;
  const wanted = kind === "partner" ? "sponsor" : kind;
  return <Tasks locale={locale} initialKind={(taskKinds as readonly string[]).includes(wanted ?? "") ? (wanted as TaskKind) : "all"} />;
}
