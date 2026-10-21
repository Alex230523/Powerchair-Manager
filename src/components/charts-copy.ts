import type { Locale } from "../lib/locale";

/** Texts shared by the charts (wave 15, prompt 2.6). */
const fr = {
  seeData: "Voir les données",
  chart: "Graphique",
  table: "Tableau",
  legend: "Séries affichées",
  total: "Total",
  noValue: "Pas de donnée",
  keys: "Flèches gauche et droite pour parcourir les valeurs.",
};
type Copy = typeof fr;
const nl: Copy = {
  seeData: "Gegevens bekijken",
  chart: "Grafiek",
  table: "Tabel",
  legend: "Getoonde reeksen",
  total: "Totaal",
  noValue: "Geen gegevens",
  keys: "Pijltjes links en rechts om de waarden te overlopen.",
};
const en: Copy = {
  seeData: "See the data",
  chart: "Chart",
  table: "Table",
  legend: "Series shown",
  total: "Total",
  noValue: "No data",
  keys: "Left and right arrows to go through the values.",
};
export const chartsCopy: Record<Locale, Copy> = { fr, nl, en };
