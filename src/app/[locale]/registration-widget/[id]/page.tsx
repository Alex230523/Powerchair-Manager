import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { getDb } from "@/lib/db";
import { publicForm } from "@/domains/registrations/service";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  let form;
  try {
    form = await publicForm(getDb(), id);
  } catch {
    notFound();
  }
  return (
    <main id="main">
      <h1>{form.title}</h1>
      <p>
        {form.organization_name} · {form.season_name}
      </p>
      <a
        href={"/" + locale + "/inscription/" + id}
        target="_blank"
        rel="noopener noreferrer"
      >
        {locale === "en"
          ? "Open secure form"
          : locale === "fr"
            ? "Ouvrir le formulaire sécurisé"
            : "Beveiligd formulier openen"}{" "}
        ↗
      </a>
    </main>
  );
}
