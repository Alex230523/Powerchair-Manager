import type { Locale } from "@/lib/locale";
import type { FineKind, FineState } from "@/domains/fines/schema";

/** Point 10: the federation's fines (règlement BPCF 2025). */
type Copy = {
  title: string;
  intro: string;
  clubIntro: string;
  none: string;
  add: string;
  club: string;
  kind: string;
  kinds: Record<FineKind, string>;
  amount: string;
  issuedOn: string;
  reason: string;
  save: string;
  cancel: string;
  saved: string;
  markPaid: string;
  markOpen: string;
  cancelFine: string;
  states: Record<FineState, string>;
  open: string;
  of: string;
};
const fr: Copy = {
  title: "Amendes",
  intro: "Les amendes du règlement aux clubs : retard (25 €), forfait (50 €), journée de matchs annulée (500 € au plus). Le club voit les siennes.",
  clubIntro: "Les amendes que la fédération a données au club.",
  none: "Aucune amende.",
  add: "Donner une amende",
  club: "Club",
  kind: "Motif",
  kinds: { late: "Retard", forfeit: "Forfait", forfeit_day: "Journée de matchs annulée", other: "Autre" },
  amount: "Montant en euros",
  issuedOn: "Date",
  reason: "Détail (facultatif)",
  save: "Enregistrer l'amende",
  cancel: "Annuler",
  saved: "Enregistré.",
  markPaid: "Marquer payée",
  markOpen: "Marquer à payer",
  cancelFine: "Annuler l'amende",
  states: { open: "À payer", paid: "Payée", cancelled: "Annulée" },
  open: "À payer : {amount}",
  of: "{what} : {club}",
};
const nl: Copy = {
  title: "Boetes",
  intro: "De boetes van het reglement aan de clubs: te laat (25 €), forfait (50 €), geannuleerde wedstrijddag (hoogstens 500 €). De club ziet de zijne.",
  clubIntro: "De boetes die de federatie aan de club gaf.",
  none: "Geen boetes.",
  add: "Een boete geven",
  club: "Club",
  kind: "Reden",
  kinds: { late: "Te laat", forfeit: "Forfait", forfeit_day: "Geannuleerde wedstrijddag", other: "Andere" },
  amount: "Bedrag in euro",
  issuedOn: "Datum",
  reason: "Detail (optioneel)",
  save: "Boete opslaan",
  cancel: "Annuleren",
  saved: "Opgeslagen.",
  markPaid: "Als betaald markeren",
  markOpen: "Als te betalen markeren",
  cancelFine: "Boete annuleren",
  states: { open: "Te betalen", paid: "Betaald", cancelled: "Geannuleerd" },
  open: "Te betalen: {amount}",
  of: "{what}: {club}",
};
const en: Copy = {
  title: "Fines",
  intro: "The fines the rules give clubs: late (25 €), forfeit (50 €), match day cancelled (500 € at most). Each club sees its own.",
  clubIntro: "The fines the federation gave the club.",
  none: "No fines.",
  add: "Give a fine",
  club: "Club",
  kind: "Reason",
  kinds: { late: "Late", forfeit: "Forfeit", forfeit_day: "Match day cancelled", other: "Other" },
  amount: "Amount in euros",
  issuedOn: "Date",
  reason: "Detail (optional)",
  save: "Save the fine",
  cancel: "Cancel",
  saved: "Saved.",
  markPaid: "Mark paid",
  markOpen: "Mark unpaid",
  cancelFine: "Cancel the fine",
  states: { open: "To pay", paid: "Paid", cancelled: "Cancelled" },
  open: "To pay: {amount}",
  of: "{what}: {club}",
};
export const finesCopy: Record<Locale, Copy> = { fr, nl, en };
