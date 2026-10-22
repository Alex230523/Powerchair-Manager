import type { Locale } from "../lib/locale";

/** Wave 17 (G3): rights « jusqu'à nouvel ordre », an end date only when chosen. */
export const durationCopy: Record<Locale, { label: string; forever: string; until: string; untilDate: string; date: string }> = {
  fr: { label: "Durée des droits", forever: "Jusqu'à nouvel ordre", until: "Jusqu'au…", untilDate: "Jusqu'au {date}", date: "Date de fin" },
  nl: { label: "Duur van de rechten", forever: "Tot nader order", until: "Tot…", untilDate: "Tot {date}", date: "Einddatum" },
  en: { label: "How long the rights last", forever: "Until further notice", until: "Until…", untilDate: "Until {date}", date: "End date" },
};

/** « Jusqu'à nouvel ordre » or « Jusqu'au 12/03/2027 »: never empty. */
export function durationText(locale: Locale, validUntil: string | Date | null | undefined) {
  const t = durationCopy[locale];
  if (!validUntil) return t.forever;
  const date = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Brussels" }).format(new Date(validUntil));
  return t.untilDate.replace("{date}", date);
}
