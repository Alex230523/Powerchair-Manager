import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { DesignGallery } from "@/components/design-gallery";
export const metadata = { title: "Design · Powerchair Football Manager" };
/** Internal gallery of the shared components, in every state and both themes. Development only. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || process.env.NODE_ENV === "production") notFound();
  return <DesignGallery locale={locale} />;
}
