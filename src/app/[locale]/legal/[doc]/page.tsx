import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { LegalPage } from "@/components/legal-page";
import { legalDocs, type LegalDoc } from "@/domains/legal/texts";
export const metadata = { title: "Informations légales · Powerchair Football Manager" };
/** 21: the public texts: conditions, privacy policy, processing agreement, sub-processors (drafts to review). */
export default async function Page({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale, doc } = await params;
  if (!isLocale(locale) || !(legalDocs as readonly string[]).includes(doc)) notFound();
  return <LegalPage locale={locale} doc={doc as LegalDoc} />;
}
