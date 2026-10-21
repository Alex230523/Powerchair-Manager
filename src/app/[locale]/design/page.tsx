import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { DesignGallery } from "@/components/design-gallery";
export const metadata = { title: "Design · Powerchair Football Manager" };
/**
 * Internal gallery of the shared components, in every state and both themes.
 * Development only (the end-to-end suite opens it on a production build with PFM_DESIGN_PAGE=true).
 */
const shown = () => process.env.NODE_ENV !== "production" || process.env.PFM_DESIGN_PAGE === "true";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !shown()) notFound();
  return <DesignGallery locale={locale} />;
}
