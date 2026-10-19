import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
export const metadata = { title: "Financement · Powerchair Football Manager" };
const copy = {
  fr: {
    title: "Financement",
    intro: "Les ressources financières du club.",
    dues: "Cotisations",
    description:
      "Gérer les barèmes, créances, réductions et échéanciers des membres.",
    open: "Ouvrir les cotisations",
    limits:
      "Les virements, QR et imports bancaires ne sont pas encore disponibles. Les dons, sponsors et demandes de subventions restent à définir.",
    club: "Gestion du club",
  },
  nl: {
    title: "Financiering",
    intro: "Financiële middelen van de club.",
    dues: "Bijdragen",
    description:
      "Beheer tarieven, vorderingen, kortingen en termijnen voor leden.",
    open: "Bijdragen openen",
    limits:
      "Overschrijvingen, QR en bankimports zijn nog niet beschikbaar. Giften, sponsors en subsidieaanvragen moeten nog worden uitgewerkt.",
    club: "Club beheren",
  },
  en: {
    title: "Funding",
    intro: "The club’s financial resources.",
    dues: "Dues",
    description: "Manage member rates, receivables, discounts and instalments.",
    open: "Open dues",
    limits:
      "Transfers, QR codes and bank imports are not yet available. Donations, sponsorship and grant applications remain to be defined.",
    club: "Club management",
  },
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = copy[locale];
  return (
    <main id="main" className="access">
      <h1>{t.title}</h1>
      <p>{t.intro}</p>
      <section className="panel">
        <h2>{t.dues}</h2>
        <p>{t.description}</p>
        <Link className="button" href={`/${locale}/dues`}>
          {t.open}
        </Link>
      </section>
      <p className="notice">{t.limits}</p>
      <Link href={`/${locale}/club/manage`}>{t.club}</Link>
    </main>
  );
}
