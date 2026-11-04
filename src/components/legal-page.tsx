import Link from "next/link";
import type { Locale } from "@/lib/locale";
import { LEGAL_UPDATED, legalDocs, legalTexts, reviewNotice, subprocessors, DPA_VERSION, type LegalDoc } from "@/domains/legal/texts";
import { dataCareCopy } from "./data-care-copy";

/** 21: one public text, readable without an account, with links to the others. */
export function LegalPage({ locale, doc }: { locale: Locale; doc: LegalDoc }) {
  const t = legalTexts[doc][locale],
    c = dataCareCopy[locale];
  const updated = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { dateStyle: "long", timeZone: "UTC" }).format(new Date((doc === "dpa" ? DPA_VERSION : LEGAL_UPDATED) + "T12:00:00Z"));
  return (
    <main id="main" className="access legal-page">
      <h1>{t.title}</h1>
      <p className="notice">{reviewNotice[locale]}</p>
      <p className="muted small">{c.updated(updated)}</p>
      {t.summary && (
        <section aria-labelledby="legal-short" className="card legal-short">
          <h2 id="legal-short">{c.shortVersion}</h2>
          <ul>
            {t.summary.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      )}
      {t.sections.map((s) => (
        <section key={s.heading}>
          <h2>{s.heading}</h2>
          {s.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
      {doc === "subprocessors" && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{c.sub.name}</th>
                <th scope="col">{c.sub.role}</th>
                <th scope="col">{c.sub.region}</th>
              </tr>
            </thead>
            <tbody>
              {subprocessors.map((x) => (
                <tr key={x.name.fr}>
                  <th scope="row">{x.name[locale]}</th>
                  <td>{x.role[locale]}</td>
                  <td>{typeof x.region === "string" ? x.region : x.region[locale]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav aria-label={c.publicPages}>
        <ul className="plain-list legal-links">
          {legalDocs
            .filter((d) => d !== doc)
            .map((d) => (
              <li key={d}>
                <Link href={`/${locale}/legal/${d}`}>{c.docs[d]}</Link>
              </li>
            ))}
        </ul>
      </nav>
    </main>
  );
}
