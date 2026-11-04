import type { Locale } from "../lib/locale";

/** 20: « Nouveautés ». */
const fr = {
  title: "Nouveautés",
  intro: "Ce qui change dans l'application pour vous, en quelques phrases.",
  loading: "Chargement…",
  unavailable: "Page indisponible pour le moment.",
  showAll: "Voir aussi les nouveautés des autres rôles",
  newBadge: "Nouveau",
  open: "Voir la page",
  none: "Rien de nouveau pour votre rôle.",
  seeAll: "Voir les nouveautés",
  close: "Fermer",
  never: "Ne plus afficher cette fenêtre",
  popupSetting: "Afficher une petite fenêtre quand une nouveauté me concerne",
  saved: "Enregistré.",
};
type Copy = typeof fr;
const nl: Copy = {
  title: "Nieuwigheden",
  intro: "Wat er voor u verandert in de toepassing, in enkele zinnen.",
  loading: "Laden…",
  unavailable: "Pagina momenteel niet beschikbaar.",
  showAll: "Ook de nieuwigheden van andere rollen tonen",
  newBadge: "Nieuw",
  open: "Naar de pagina",
  none: "Niets nieuws voor uw rol.",
  seeAll: "Nieuwigheden bekijken",
  close: "Sluiten",
  never: "Dit venster niet meer tonen",
  popupSetting: "Een klein venster tonen wanneer een nieuwigheid mij aangaat",
  saved: "Opgeslagen.",
};
const en: Copy = {
  title: "What's new",
  intro: "What changes in the application for you, in a few sentences.",
  loading: "Loading…",
  unavailable: "Page unavailable for now.",
  showAll: "Also show what's new for other roles",
  newBadge: "New",
  open: "Open the page",
  none: "Nothing new for your role.",
  seeAll: "See what's new",
  close: "Close",
  never: "Do not show this window again",
  popupSetting: "Show a small window when something new concerns me",
  saved: "Saved.",
};
export const newsCopy: Record<Locale, Copy> = { fr, nl, en };
