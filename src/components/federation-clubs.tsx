"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { coursesView } from "@/domains/coaches/service";
import { errors } from "./access-copy";
import { PageHeader, EmptyState } from "./ui";

type View = Awaited<ReturnType<typeof coursesView>>;
const copy = {
  fr: {
    title: "Clubs affiliés",
    intro:
      "Clubs qui ont choisi votre fédération dans « Gestion du club ». Seuls l'identité publique et les effectifs sont visibles.",
    loading: "Chargement des clubs…",
    empty: "Aucun club affilié pour l'instant.",
    federationOnly:
      "Choisissez un profil fédéral pour voir les clubs affiliés.",
    club: "Club",
    contact: "Contact",
    players: "Joueurs",
    coaches: "Coachs",
    teams: "Équipes",
    total: "Total",
  },
  nl: {
    title: "Aangesloten clubs",
    intro:
      "Clubs die uw federatie kozen in ‘Clubbeheer’. Enkel de openbare identiteit en de aantallen zijn zichtbaar.",
    loading: "Clubs laden…",
    empty: "Nog geen aangesloten clubs.",
    federationOnly:
      "Kies een federatieprofiel om de aangesloten clubs te zien.",
    club: "Club",
    contact: "Contact",
    players: "Spelers",
    coaches: "Coaches",
    teams: "Teams",
    total: "Totaal",
  },
  en: {
    title: "Affiliated clubs",
    intro:
      "Clubs that chose your federation in ‘Club management’. Only public identity and headcounts are visible.",
    loading: "Loading clubs…",
    empty: "No affiliated club yet.",
    federationOnly: "Choose a federation profile to see affiliated clubs.",
    club: "Club",
    contact: "Contact",
    players: "Players",
    coaches: "Coaches",
    teams: "Teams",
    total: "Total",
  },
};

/** Federation: list of affiliated clubs with headcounts. */
export function FederationClubs({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/courses", { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!cancelled) setView(v);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(
          ["FEDERATION_ONLY", "FORBIDDEN"].includes(e.message)
            ? t.federationOnly
            : (errors[e.message]?.[locale] ?? e.message),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [locale, t.federationOnly]);
  const sum = (k: "players" | "coaches" | "teams") =>
    view?.clubs.reduce((n, c) => n + c[k], 0) ?? 0;
  return (
    <main id="main" className="access federation-clubs">
      <PageHeader title={t.title} subtitle={t.intro} />
      {error && <p className="notice">{error}</p>}
      {!view && !error && <p role="status">{t.loading}</p>}
      {view &&
        (view.clubs.length ? (
          <div
            className="table-scroll"
            role="region"
            aria-label={t.title}
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">{t.club}</th>
                  <th scope="col">{t.contact}</th>
                  <th scope="col" className="num">
                    {t.players}
                  </th>
                  <th scope="col" className="num">
                    {t.coaches}
                  </th>
                  <th scope="col" className="num">
                    {t.teams}
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.clubs.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>
                      {c.contact_email ? (
                        <a href={"mailto:" + c.contact_email}>
                          {c.contact_email}
                        </a>
                      ) : null}
                    </td>
                    <td className="num">{c.players}</td>
                    <td className="num">{c.coaches}</td>
                    <td className="num">{c.teams}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{t.total}</th>
                  <td />
                  <td className="num">{sum("players")}</td>
                  <td className="num">{sum("coaches")}</td>
                  <td className="num">{sum("teams")}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState title={t.empty} />
        ))}
    </main>
  );
}
