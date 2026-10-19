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
    <main id="main" className="widget">
      <div className="club-banner">
        {form.logo_version && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="club-banner-logo"
            src={`/api/club/logo?form=${form.id}&v=${form.logo_version}`}
            alt={form.organization_name}
          />
        )}
        <div>
          <h1>{form.title}</h1>
          <p>
            {form.organization_name} · {form.season_name}
          </p>
        </div>
      </div>
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
