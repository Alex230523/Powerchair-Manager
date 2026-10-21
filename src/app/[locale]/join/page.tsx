import { notFound } from "next/navigation";
import { z } from "zod";
import { isLocale } from "@/lib/locale";
import { Join } from "@/components/join";
export const metadata = { title: "Rejoindre la plateforme · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // Address of the platform team, for federations (wave 16, I1).
  const contact = z.email().safeParse(process.env.PFM_CONTACT_EMAIL ?? "");
  return <Join locale={locale} contact={contact.success ? contact.data : null} />;
}
