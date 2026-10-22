import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Contacts } from "@/components/contacts";
export const metadata = { title: "Carnet de contacts · Powerchair Football Manager" };
/** A4: « ?contact= » opens a contact's sheet (Ctrl+K, a task, a grant). */
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ contact?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { contact } = await searchParams;
  return <Contacts locale={locale} start={/^[0-9a-f-]{36}$/i.test(contact ?? "") ? contact : undefined} />;
}
