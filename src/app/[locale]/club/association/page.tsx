import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Association } from "@/components/association";
export const metadata = { title: "Vie de l'ASBL · Powerchair Football Manager" };
/** 17: the register of members, the general assembly and the board. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <Suspense>
      <Association locale={locale} />
    </Suspense>
  );
}
