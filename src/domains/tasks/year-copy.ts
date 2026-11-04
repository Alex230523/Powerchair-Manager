import type { Category } from "./schema";

/** 2 (6): « Calendrier administratif de l'année », the page for the board (fr, nl, en). */
export const yearPdfCopy = {
  fr: { title: "Calendrier administratif de l'année", period: "Du {from} au {to}", states: { done: "fait", upcoming: "à venir", late: "en retard" }, recurring: "récurrent", empty: "Rien de prévu sur ces douze mois." },
  nl: { title: "Administratieve jaarkalender", period: "Van {from} tot {to}", states: { done: "klaar", upcoming: "komt eraan", late: "te laat" }, recurring: "terugkerend", empty: "Niets gepland in deze twaalf maanden." },
  en: { title: "Administrative calendar of the year", period: "From {from} to {to}", states: { done: "done", upcoming: "to come", late: "late" }, recurring: "recurring", empty: "Nothing planned over these twelve months." },
} as const;
export type YearPdfItem = { date: string; category: Category; title: string; state: "done" | "upcoming" | "late"; recurring: boolean };
