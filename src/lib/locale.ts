import { english } from "./english";
export const locales = ["fr", "nl", "en"] as const;
export type Locale = (typeof locales)[number];
export function isLocale(value: string): value is Locale {
  return locales.some((locale) => locale === value);
}
// Shell-level strings shared by every page. Module copy lives next to each component.
export const copy = {
  fr: { skip: "Aller au contenu", language: "Langue" },
  nl: { skip: "Naar de inhoud", language: "Taal" },
  en: english.copy,
} satisfies Record<Locale, Record<string, string>>;
