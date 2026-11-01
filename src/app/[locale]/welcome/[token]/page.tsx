import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { Welcome } from "@/components/welcome";
import { sessionShell } from "@/lib/appearance";
export const metadata = { title: "Créer mon compte · Powerchair Football Manager" };
export default async function Page({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  if (!isLocale(locale) || !/^[a-f0-9]{64}$/.test(token)) notFound();
  const { signedIn } = await sessionShell();
  return <Welcome locale={locale} token={token} signedIn={signedIn} />;
}
