import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Tasks } from "@/components/tasks";
import { categories, categoryOf, taskKinds, type Category, type TaskKind } from "@/domains/tasks/schema";
export const metadata = { title: "Tâches · Powerchair Football Manager" };
/**
 * A1: the central to-do. « ?category= » opens one category; « ?kind= » of
 * wave 17 (and « partner » of wave 15) still lands on its category;
 * « ?task= » opens a task; « ?new=1 » the new task window (Ctrl+K);
 * « ?grant= » and « ?partner= » keep the tasks of one grant or sponsor (A2).
 */
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ kind?: string; category?: string; task?: string; new?: string; grant?: string; partner?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const q = await searchParams;
  const kind = q.kind === "partner" ? "sponsor" : q.kind;
  const initial: Category | "all" = (categories as readonly string[]).includes(q.category ?? "")
    ? (q.category as Category)
    : (taskKinds as readonly string[]).includes(kind ?? "")
      ? categoryOf(kind as TaskKind)
      : "all";
  const id = (v?: string) => (/^[0-9a-f-]{36}$/i.test(v ?? "") ? v : undefined);
  // A2: « ?grant= » and « ?partner= »: the tasks of one grant or one sponsor.
  const linked = id(q.grant) || id(q.partner) ? { grant: id(q.grant), partner: id(q.partner) } : undefined;
  return <Tasks locale={locale} initialCategory={initial} openTask={id(q.task)} create={q.new === "1"} linked={linked} />;
}
