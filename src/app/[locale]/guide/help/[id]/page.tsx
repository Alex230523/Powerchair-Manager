import { existsSync } from "node:fs";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { helpSheets } from "@/domains/guide/help";
import { HelpSheetPage } from "@/components/knowledge";
export const metadata = { title: "Mode d'emploi · Powerchair Football Manager" };
/** G10: one how-to sheet; its capture shows once the audit has taken it (public/help). */
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !helpSheets.some((s) => s.id === id)) notFound();
  return <HelpSheetPage locale={locale} id={id} capture={existsSync(join(process.cwd(), "public", "help", `${id}.png`))} />;
}
