import type { Locale } from "@/lib/locale";

/** Lot 3 (05/11/2026): the public page of a match, and its link in the match's journey. */
type Copy = {
  title: string;
  statuses: Record<"scheduled" | "live" | "played" | "postponed" | "cancelled", string>;
  home: string;
  away: string;
  noScore: string;
  events: string;
  noEvents: string;
  kinds: Record<string, string>;
  number: string;
  refresh: string;
  updated: string;
  gone: string;
  poweredBy: string;
  /* In the journey. */
  share: string;
  shareIntro: string;
  enable: string;
  disable: string;
  copy: string;
  copied: string;
  open: string;
  enabled: string;
};
const fr: Copy = {
  title: "Match en direct",
  statuses: { scheduled: "À venir", live: "En cours", played: "Terminé", postponed: "Reporté", cancelled: "Annulé" },
  home: "à domicile",
  away: "à l'extérieur",
  noScore: "Le score s'affichera ici au coup d'envoi.",
  events: "Faits de match",
  noEvents: "Rien à signaler pour l'instant.",
  kinds: { goal: "But", goal_against: "But adverse", yellow: "Carton jaune", red: "Carton rouge", corner: "Corner", corner_against: "Corner adverse", timeout: "Temps mort" },
  number: "n° {n}",
  refresh: "Actualiser",
  updated: "Mis à jour à {time}, puis toutes les 20 secondes.",
  gone: "Ce lien n'est plus actif.",
  poweredBy: "Suivi avec Powerchair Football Manager",
  share: "Page publique du match",
  shareIntro: "Un lien sans compte pour les parents et supporters : le score en direct et le résultat. Les joueurs y sont nommés selon les règles des noms publics (adultes, ou avec accord), les autres par leur numéro.",
  enable: "Créer le lien",
  disable: "Retirer le lien",
  copy: "Copier le lien",
  copied: "Lien copié.",
  open: "Ouvrir la page",
  enabled: "Lien actif : partagez-le.",
};
const nl: Copy = {
  title: "Wedstrijd live",
  statuses: { scheduled: "Nog te spelen", live: "Bezig", played: "Afgelopen", postponed: "Uitgesteld", cancelled: "Afgelast" },
  home: "thuis",
  away: "uit",
  noScore: "De score verschijnt hier bij de aftrap.",
  events: "Wedstrijdfeiten",
  noEvents: "Voorlopig niets te melden.",
  kinds: { goal: "Doelpunt", goal_against: "Tegendoelpunt", yellow: "Gele kaart", red: "Rode kaart", corner: "Hoekschop", corner_against: "Hoekschop tegenstander", timeout: "Time-out" },
  number: "nr. {n}",
  refresh: "Vernieuwen",
  updated: "Bijgewerkt om {time}, daarna elke 20 seconden.",
  gone: "Deze link is niet meer actief.",
  poweredBy: "Gevolgd met Powerchair Football Manager",
  share: "Publieke pagina van de wedstrijd",
  shareIntro: "Een link zonder account voor ouders en supporters: de score live en het resultaat. Spelers worden genoemd volgens de regels voor publieke namen (volwassenen, of met akkoord), de anderen met hun nummer.",
  enable: "Link aanmaken",
  disable: "Link intrekken",
  copy: "Link kopiëren",
  copied: "Link gekopieerd.",
  open: "Pagina openen",
  enabled: "Link actief: deel hem.",
};
const en: Copy = {
  title: "Match live",
  statuses: { scheduled: "Upcoming", live: "In progress", played: "Finished", postponed: "Postponed", cancelled: "Cancelled" },
  home: "at home",
  away: "away",
  noScore: "The score shows here at kick-off.",
  events: "Match facts",
  noEvents: "Nothing to report yet.",
  kinds: { goal: "Goal", goal_against: "Goal against", yellow: "Yellow card", red: "Red card", corner: "Corner", corner_against: "Corner against", timeout: "Timeout" },
  number: "no. {n}",
  refresh: "Refresh",
  updated: "Updated at {time}, then every 20 seconds.",
  gone: "This link is no longer active.",
  poweredBy: "Followed with Powerchair Football Manager",
  share: "Public page of the match",
  shareIntro: "A link without an account for parents and supporters: the live score and the result. Players are named by the public name rules (adults, or with consent), the others by their number.",
  enable: "Create the link",
  disable: "Remove the link",
  copy: "Copy the link",
  copied: "Link copied.",
  open: "Open the page",
  enabled: "Link active: share it.",
};
export const publicLiveCopy: Record<Locale, Copy> = { fr, nl, en };
