"use client";
import { useCallback } from "react";
import type { Locale } from "@/lib/locale";
import { useData } from "./use-api";
import { Card, EmptyState } from "./ui";

const copy = {
  fr: {
    title: "Fidélisation des joueurs",
    intro: "Qui revient d'une saison à l'autre. Une personne compte une fois par saison, quel que soit son nombre d'équipes.",
    season: "Saison",
    members: "Joueurs",
    stayed: "Restés",
    joined: "Arrivés",
    left: "Partis",
    rate: "Taux de réinscription",
    none: "Il faut au moins deux saisons avec des équipes pour mesurer la fidélisation.",
  },
  nl: {
    title: "Spelersbinding",
    intro: "Wie terugkomt van het ene seizoen naar het andere. Een persoon telt één keer per seizoen, ongeacht het aantal teams.",
    season: "Seizoen",
    members: "Spelers",
    stayed: "Gebleven",
    joined: "Nieuw",
    left: "Vertrokken",
    rate: "Herinschrijvingsgraad",
    none: "Er zijn minstens twee seizoenen met teams nodig om de binding te meten.",
  },
  en: {
    title: "Player retention",
    intro: "Who comes back from one season to the next. A person counts once per season, whatever their number of teams.",
    season: "Season",
    members: "Players",
    stayed: "Stayed",
    joined: "Joined",
    left: "Left",
    rate: "Re-enrolment rate",
    none: "At least two seasons with teams are needed to measure retention.",
  },
};
type Row = {
  season: string;
  members: number;
  stayed: number | null;
  joined: number | null;
  left: number | null;
  rate: number | null;
};

/** Retention by season, shown on the statistics page to those who see the directory. */
export function RetentionCard({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const failure = useCallback(() => "", []);
  const { data } = useData<{ seasons: Row[] }>("/api/statistics/retention", failure);
  if (!data) return null;
  const rows = data.seasons;
  return (
    <Card title={t.title} labelledBy="retention-title" headingId="retention-title">
      <p className="muted">{t.intro}</p>
      {rows.length < 2 ? (
        <EmptyState title={t.none} />
      ) : (
        <div className="table-scroll" role="region" aria-label={t.title} tabIndex={0}>
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">{t.season}</th>
                <th scope="col" className="num">{t.members}</th>
                <th scope="col" className="num">{t.stayed}</th>
                <th scope="col" className="num">{t.joined}</th>
                <th scope="col" className="num">{t.left}</th>
                <th scope="col" className="num">{t.rate}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.season}>
                  <th scope="row">{r.season}</th>
                  <td className="num">{r.members}</td>
                  <td className="num">{r.stayed ?? "—"}</td>
                  <td className="num">{r.joined ?? "—"}</td>
                  <td className="num">{r.left ?? "—"}</td>
                  <td className="num">
                    {r.rate === null ? "—" : (
                      <>
                        <meter min={0} max={100} value={r.rate} aria-hidden="true" /> {r.rate} %
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
