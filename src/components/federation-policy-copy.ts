import type { Locale } from "@/lib/locale";

/** International, step 2 (05/11/2026): the federation's rulebook (amounts) and country. */
type Copy = {
  title: string;
  intro: string;
  country: string;
  countryHint: string;
  countrySave: string;
  countrySaved: string;
  amounts: string;
  amountsIntro: string;
  rates: string;
  national: string;
  international: string;
  formats: Record<"academy" | "elite" | "elite_certified", string>;
  perYear: string;
  fileFee: string;
  caps: string;
  capNational: string;
  capInternational: string;
  fines: string;
  fineKinds: Record<"late" | "forfeit" | "forfeit_day", string>;
  save: string;
  saved: string;
  reset: string;
  resetConfirm: string;
  resetDone: string;
  isDefault: string;
  version: string;
  history: string;
  historyNone: string;
  historyLine: string;
  readOnly: string;
  cancel: string;
};
const fr: Copy = {
  title: "Règlement et pays",
  intro: "Les montants que l'application propose viennent d'ici : indemnité de formation, frais de dossier international, plafonds, amendes. Sans réglage, le barème BPCF 2025 s'applique. Chaque enregistrement garde une version.",
  country: "Pays de la fédération",
  countryHint: "Vos clubs prennent le même pays. Il sert aux transferts entre fédérations de la plateforme.",
  countrySave: "Enregistrer le pays",
  countrySaved: "Pays enregistré.",
  amounts: "Barème",
  amountsIntro: "Montants en euros. Un transfert vers l'étranger ajoute les frais de dossier ; le plafond s'applique ensuite.",
  rates: "Indemnité de formation, par année",
  national: "Transfert national",
  international: "Transfert international",
  formats: { academy: "Académie", elite: "Élite", elite_certified: "Élite, entraîneurs diplômés" },
  perYear: "par année",
  fileFee: "Frais de dossier international",
  caps: "Plafonds",
  capNational: "Plafond national",
  capInternational: "Plafond international",
  fines: "Amendes proposées",
  fineKinds: { late: "Retard", forfeit: "Forfait", forfeit_day: "Journée de matchs non tenue" },
  save: "Enregistrer le barème",
  saved: "Barème enregistré.",
  reset: "Revenir au barème BPCF 2025",
  resetConfirm: "Revenir au barème BPCF 2025 ? Vos montants seront remplacés ; l'historique reste.",
  resetDone: "Barème BPCF 2025 rétabli.",
  isDefault: "Barème BPCF 2025, sans modification.",
  version: "Version {n}, {day} par {name}",
  history: "Historique",
  historyNone: "Aucune modification enregistrée.",
  historyLine: "Version {n} · {day} · {name}",
  readOnly: "Lecture seule : la présidence et les délégués aux licences modifient le règlement.",
  cancel: "Annuler",
};
const nl: Copy = {
  title: "Reglement en land",
  intro: "De bedragen die de toepassing voorstelt komen van hier: opleidingsvergoeding, dossierkosten internationaal, plafonds, boetes. Zonder instelling geldt het BPCF-barema 2025. Elke opslag bewaart een versie.",
  country: "Land van de federatie",
  countryHint: "Uw clubs krijgen hetzelfde land. Het dient voor transfers tussen federaties van het platform.",
  countrySave: "Land opslaan",
  countrySaved: "Land opgeslagen.",
  amounts: "Barema",
  amountsIntro: "Bedragen in euro. Een transfer naar het buitenland voegt de dossierkosten toe; daarna geldt het plafond.",
  rates: "Opleidingsvergoeding, per jaar",
  national: "Nationale transfer",
  international: "Internationale transfer",
  formats: { academy: "Academie", elite: "Elite", elite_certified: "Elite, gediplomeerde trainers" },
  perYear: "per jaar",
  fileFee: "Dossierkosten internationaal",
  caps: "Plafonds",
  capNational: "Nationaal plafond",
  capInternational: "Internationaal plafond",
  fines: "Voorgestelde boetes",
  fineKinds: { late: "Te laat", forfeit: "Forfait", forfeit_day: "Niet gespeelde wedstrijddag" },
  save: "Barema opslaan",
  saved: "Barema opgeslagen.",
  reset: "Terug naar het BPCF-barema 2025",
  resetConfirm: "Terug naar het BPCF-barema 2025? Uw bedragen worden vervangen; de geschiedenis blijft.",
  resetDone: "BPCF-barema 2025 hersteld.",
  isDefault: "BPCF-barema 2025, ongewijzigd.",
  version: "Versie {n}, {day} door {name}",
  history: "Geschiedenis",
  historyNone: "Geen wijziging opgeslagen.",
  historyLine: "Versie {n} · {day} · {name}",
  readOnly: "Alleen lezen: het voorzitterschap en de afgevaardigden voor de licenties wijzigen het reglement.",
  cancel: "Annuleren",
};
const en: Copy = {
  title: "Rulebook and country",
  intro: "The amounts the application offers come from here: training compensation, international file fee, caps, fines. Without a setting, the BPCF 2025 scale applies. Every save keeps a version.",
  country: "Country of the federation",
  countryHint: "Your clubs take the same country. It serves the transfers between federations of the platform.",
  countrySave: "Save the country",
  countrySaved: "Country saved.",
  amounts: "Scale",
  amountsIntro: "Amounts in euros. A transfer abroad adds the file fee; the cap applies after.",
  rates: "Training compensation, per year",
  national: "National transfer",
  international: "International transfer",
  formats: { academy: "Academy", elite: "Elite", elite_certified: "Elite, qualified coaches" },
  perYear: "per year",
  fileFee: "International file fee",
  caps: "Caps",
  capNational: "National cap",
  capInternational: "International cap",
  fines: "Fines offered",
  fineKinds: { late: "Late", forfeit: "Forfeit", forfeit_day: "Match day not held" },
  save: "Save the scale",
  saved: "Scale saved.",
  reset: "Back to the BPCF 2025 scale",
  resetConfirm: "Back to the BPCF 2025 scale? Your amounts are replaced; the history stays.",
  resetDone: "BPCF 2025 scale restored.",
  isDefault: "BPCF 2025 scale, unchanged.",
  version: "Version {n}, {day} by {name}",
  history: "History",
  historyNone: "No change saved.",
  historyLine: "Version {n} · {day} · {name}",
  readOnly: "Read only: the presidency and the licence delegates change the rulebook.",
  cancel: "Cancel",
};
export const federationPolicyCopy: Record<Locale, Copy> = { fr, nl, en };
