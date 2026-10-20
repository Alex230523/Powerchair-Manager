"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { attestationsView } from "@/domains/dues/attestation";
import { errors } from "./access-copy";
import { useData } from "./use-api";

const copy = {
  fr: {
    title: "Attestations pour la mutuelle",
    intro:
      "Les mutuelles remboursent une partie de l'affiliation à un club sportif. Une attestation par personne et par saison, dès que la cotisation de la saison est entièrement payée. Imprimez-la ou enregistrez-la en PDF, puis joignez-la au formulaire de votre mutuelle.",
    back: "Cotisations",
    loading: "Chargement…",
    unavailable: "Attestations indisponibles pour le moment.",
    season: "Saison",
    print: "Imprimer",
    printAll: "Imprimer toutes les attestations",
    only: "Imprimer cette attestation",
    showAll: "Voir toutes les attestations",
    notPaid: "Cotisation pas encore entièrement payée",
    none: "Aucune cotisation pour cette saison.",
    missing:
      "Complétez l'adresse, le numéro d'entreprise et le signataire du club dans Gestion du club : ils figurent sur l'attestation.",
    heading: "Attestation d'affiliation à un club sportif",
    body: "Le club {club}{address}{company}{federation} certifie que {name}{born} est membre du club pour la saison {season} (du {from} au {to}) et a payé une cotisation de {amount}{paid}.",
    bornText: ", né(e) le {d},",
    addressText: ", {a}",
    companyText: ", numéro d'entreprise {n}",
    federationText: ", affilié à la {f},",
    paidText: " (dernier paiement le {d})",
    done: "Fait le {d}.",
    signature: "Signature",
    signatory: "Pour le club",
    stamp: "À joindre au formulaire de remboursement de votre mutuelle.",
  },
  nl: {
    title: "Attesten voor het ziekenfonds",
    intro:
      "Ziekenfondsen betalen een deel van het lidgeld van een sportclub terug. Eén attest per persoon en per seizoen, zodra de bijdrage van het seizoen volledig betaald is. Druk het af of bewaar het als pdf en voeg het bij het formulier van uw ziekenfonds.",
    back: "Bijdragen",
    loading: "Laden…",
    unavailable: "Attesten momenteel niet beschikbaar.",
    season: "Seizoen",
    print: "Afdrukken",
    printAll: "Alle attesten afdrukken",
    only: "Dit attest afdrukken",
    showAll: "Alle attesten tonen",
    notPaid: "Bijdrage nog niet volledig betaald",
    none: "Geen bijdrage voor dit seizoen.",
    missing:
      "Vul het adres, het ondernemingsnummer en de ondertekenaar van de club aan in Clubbeheer: ze staan op het attest.",
    heading: "Attest van aansluiting bij een sportclub",
    body: "De club {club}{address}{company}{federation} verklaart dat {name}{born} lid is van de club voor het seizoen {season} (van {from} tot {to}) en een bijdrage van {amount} betaald heeft{paid}.",
    bornText: ", geboren op {d},",
    addressText: ", {a}",
    companyText: ", ondernemingsnummer {n}",
    federationText: ", aangesloten bij de {f},",
    paidText: " (laatste betaling op {d})",
    done: "Opgemaakt op {d}.",
    signature: "Handtekening",
    signatory: "Voor de club",
    stamp: "Voeg dit bij het terugbetalingsformulier van uw ziekenfonds.",
  },
  en: {
    title: "Mutual insurance attestations",
    intro:
      "Belgian mutual insurance funds refund part of a sports club membership. One attestation per person and season, once the season's dues are fully paid. Print it or save it as PDF and attach it to your fund's form.",
    back: "Dues",
    loading: "Loading…",
    unavailable: "Attestations unavailable right now.",
    season: "Season",
    print: "Print",
    printAll: "Print all attestations",
    only: "Print this attestation",
    showAll: "Show all attestations",
    notPaid: "Dues not fully paid yet",
    none: "No dues for this season.",
    missing:
      "Complete the club address, company number and signatory in Club management: they appear on the attestation.",
    heading: "Sports club membership attestation",
    body: "The club {club}{address}{company}{federation} certifies that {name}{born} is a member of the club for the {season} season ({from} to {to}) and paid a membership fee of {amount}{paid}.",
    bornText: ", born on {d},",
    addressText: ", {a}",
    companyText: ", company number {n}",
    federationText: ", affiliated with the {f},",
    paidText: " (last payment on {d})",
    done: "Issued on {d}.",
    signature: "Signature",
    signatory: "For the club",
    stamp: "Attach to your mutual insurance refund form.",
  },
};
type View = Awaited<ReturnType<typeof attestationsView>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

export function Attestations({
  locale,
  season,
  profile,
}: {
  locale: Locale;
  season: string;
  profile: string;
}) {
  const t = copy[locale];
  const [chosen, setChosen] = useState(season);
  const failure = useCallback(
    (code: string) => errors[code]?.[locale] ?? t.unavailable,
    [locale, t.unavailable],
  );
  const { data, error } = useData<View>(
    "/api/dues/attestations" + (chosen ? `?season=${encodeURIComponent(chosen)}` : ""),
    failure,
  );
  const day = (d: string) =>
    new Intl.DateTimeFormat(tag(locale), { dateStyle: "long", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  const money = (c: number) =>
    new Intl.NumberFormat(tag(locale), { style: "currency", currency: "EUR" }).format(c / 100);
  if (!data)
    return (
      <main id="main" className="access attestations">
        <h1>{t.title}</h1>
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const s = data.season;
  const eligible = data.people.filter((x) => x.eligible && (!profile || x.profile_id === profile));
  const club = data.club;
  return (
    <main id="main" className="access attestations">
      <p className="back-link no-print">
        <Link href={`/${locale}/dues`}>{t.back}</Link>
      </p>
      <div className="no-print">
        <h1>{t.title}</h1>
        <p className="muted">{t.intro}</p>
        {(!club.address || !club.signatory) && <p className="notice">{t.missing}</p>}
        <div className="inline-form">
          <label htmlFor="att-season">
            {t.season}
            <select id="att-season" value={s?.id ?? ""} onChange={(e) => setChosen(e.target.value)}>
              {data.seasons.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </label>
          {eligible.length > 0 && (
            <button type="button" className="button" onClick={() => window.print()}>
              {profile ? t.only : eligible.length > 1 ? t.printAll : t.print}
            </button>
          )}
          {profile && (
            <Link className="button secondary" href={`/${locale}/dues/attestations`}>{t.showAll}</Link>
          )}
        </div>
        {data.people.length ? (
          <ul className="profile-list">
            {data.people
              .filter((x) => !profile || x.profile_id === profile)
              .map((x) => (
                <li key={x.profile_id}>
                  <div>
                    <strong>{x.full_name}</strong>
                    <p className="muted small">
                      {x.eligible ? money(x.paid_cents) : t.notPaid}
                    </p>
                  </div>
                  {x.eligible && !profile && (
                    <Link className="text-button" href={`/${locale}/dues/attestations?season=${s?.id}&profile=${x.profile_id}`}>
                      {t.only}
                      <span className="sr-only"> : {x.full_name}</span>
                    </Link>
                  )}
                </li>
              ))}
          </ul>
        ) : (
          <p className="empty-directory">{t.none}</p>
        )}
      </div>
      {s &&
        eligible.map((x) => (
          <article key={x.profile_id} className="attestation-sheet" aria-label={`${t.heading} : ${x.full_name}`}>
            <h2>{t.heading}</h2>
            <p className="muted">{club.name} · {s.name}</p>
            <p>
              {t.body
                .replace("{club}", club.name)
                .replace("{address}", club.address ? t.addressText.replace("{a}", club.address) : "")
                .replace("{company}", club.company_number ? t.companyText.replace("{n}", club.company_number) : "")
                .replace("{federation}", club.federation ? t.federationText.replace("{f}", club.federation) : "")
                .replace("{name}", x.full_name)
                .replace("{born}", x.birth_date ? t.bornText.replace("{d}", day(x.birth_date)) : "")
                .replace("{season}", s.name)
                .replace("{from}", day(s.starts_on))
                .replace("{to}", day(s.ends_on))
                .replace("{amount}", money(x.paid_cents))
                .replace("{paid}", x.last_paid_on ? t.paidText.replace("{d}", day(x.last_paid_on)) : "")}
            </p>
            <p>{t.done.replace("{d}", day(data.issuedOn))}</p>
            <div className="attestation-sign">
              <p>
                {t.signatory}
                {club.signatory && <><br /><strong>{club.signatory}</strong></>}
              </p>
              <p className="signature-box">{t.signature}</p>
            </div>
            <p className="muted small">{t.stamp}</p>
          </article>
        ))}
    </main>
  );
}
