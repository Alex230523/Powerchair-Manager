import type { Locale } from "@/lib/locale";

/** 1: the event's place, one search over our places, the shared directory and free text. */
export const placeComboCopy: Record<Locale, { label: string; hint: string; ours: string; shared: string; free: string; create: string; none: string; results: string; clear: string }> = {
  fr: {
    label: "Lieu",
    hint: "Tapez pour chercher parmi nos lieux et l'annuaire partagé. Sans choix dans la liste, le texte tapé devient un lieu libre.",
    ours: "Nos lieux",
    shared: "Annuaire partagé",
    free: "Utiliser « {text} » comme lieu libre",
    create: "+ Créer ce lieu",
    none: "Aucun lieu trouvé.",
    results: "{n} propositions.",
    clear: "Effacer le lieu",
  },
  nl: {
    label: "Locatie",
    hint: "Typ om te zoeken in onze locaties en het gedeelde register. Zonder keuze in de lijst wordt de getypte tekst een vrije locatie.",
    ours: "Onze locaties",
    shared: "Gedeeld register",
    free: "« {text} » als vrije locatie gebruiken",
    create: "+ Deze locatie aanmaken",
    none: "Geen locatie gevonden.",
    results: "{n} voorstellen.",
    clear: "Locatie wissen",
  },
  en: {
    label: "Place",
    hint: "Type to search our places and the shared directory. Without a choice in the list, the text typed becomes a free-text place.",
    ours: "Our places",
    shared: "Shared directory",
    free: "Use « {text} » as a free-text place",
    create: "+ Create this place",
    none: "No place found.",
    results: "{n} suggestions.",
    clear: "Clear the place",
  },
};
