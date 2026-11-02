import { notFound } from "next/navigation";
import { Home } from "@/components/home";
import { homeCopy } from "@/components/home-copy";
import { isLocale } from "@/lib/locale";
export const metadata = {
  title: "Powerchair Football Manager",
  description:
    "Gestion des clubs de Powerchair Football : joueurs, inscriptions, documents, calendrier, présences et cotisations.",
};
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ info?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { info } = await searchParams;
  return (
    <>
      {/* 24: an old link to the messaging lands here with a short word. */}
      {info === "messagerie" && (
        <p role="status" className="notice page-notice">
          {homeCopy[locale].messagingRemoved}
        </p>
      )}
      <Home locale={locale} />
      <footer className="app-footer">Powerchair Football Manager</footer>
    </>
  );
}
