import type { Locale } from "../lib/locale";

/** Texts of the collection bar (wave 15, 2.8), shared by the home and the dues page. */
export const collectionCopy: Record<Locale, { title: string; rate: string; collected: string; remaining: string; late: string; none: string }> = {
  fr: { title: "Taux d’encaissement", rate: "{rate} % encaissé", collected: "Encaissé", remaining: "Reste à encaisser", late: "dont en retard", none: "Aucune cotisation attendue pour cette saison." },
  nl: { title: "Inningsgraad", rate: "{rate} % geïnd", collected: "Geïnd", remaining: "Nog te innen", late: "waarvan achterstallig", none: "Geen lidgeld verwacht voor dit seizoen." },
  en: { title: "Collection rate", rate: "{rate} % collected", collected: "Collected", remaining: "Still to collect", late: "of which late", none: "No dues expected for this season." },
};
