import { notFound } from "next/navigation";
import { Home } from "@/components/home";
import { isLocale } from "@/lib/locale";
export const metadata = {
  title: "Powerchair Football Manager",
  description:
    "Gestion des clubs de Powerchair Football : joueurs, inscriptions, documents, calendrier, présences et cotisations.",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <>
      <Home locale={locale} />
      <footer className="app-footer">Powerchair Football Manager</footer>
    </>
  );
}
