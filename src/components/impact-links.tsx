"use client";
import Link from "next/link";
import type { Locale } from "@/lib/locale";
import type { fundingView } from "@/domains/funding/service";
import { impactCopy } from "./impact-copy";

/** H13: on a grant, « Générer le rapport d'impact » for its period, and the reports already filed. */
type View = Awaited<ReturnType<typeof fundingView>>;
const words = {
  fr: { generate: "Générer le rapport d'impact", filed: "Rapports d'impact joints", none: "Aucun rapport joint." },
  nl: { generate: "Het impactverslag opmaken", filed: "Bijgevoegde impactverslagen", none: "Geen verslag bijgevoegd." },
  en: { generate: "Generate the impact report", filed: "Impact reports filed", none: "No report filed." },
};
export function ImpactLinks({ locale, data, grant }: { locale: Locale; data: View; grant: { id: string; starts_on: string | null; ends_on: string | null } }) {
  const w = words[locale];
  const files = data.attachments.filter((a) => a.grant_id === grant.id);
  const period = grant.starts_on && grant.ends_on && grant.ends_on >= grant.starts_on ? `&from=${grant.starts_on}&to=${grant.ends_on}` : "";
  return (
    <section className="impact-links" aria-labelledby={`impact-${grant.id}`}>
      <h3 id={`impact-${grant.id}`}>{impactCopy[locale].title}</h3>
      <p>
        <Link className="button secondary sm" href={`/${locale}/statistics/impact?grant=${grant.id}${period}`}>
          {w.generate}
        </Link>
      </p>
      {files.length ? (
        <ul className="plain-list" aria-label={w.filed}>
          {files.map((f) => (
            <li key={f.id}>
              <a href={`/api/funding/attachment?id=${f.id}`} download>
                {f.filename}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">{w.none}</p>
      )}
    </section>
  );
}
