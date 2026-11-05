import type { Locale } from "@/lib/locale";
import type { DecisionKind } from "@/domains/commission/schema";

/** Lot 6 (05/11/2026): the commission's journal. */
type Copy = {
  title: string;
  intro: string;
  none: string;
  record: string;
  kind: string;
  kinds: Record<DecisionKind, string>;
  subject: string;
  decision: string;
  reference: string;
  decidedOn: string;
  save: string;
  cancel: string;
  saved: string;
  sign: string;
  unsign: string;
  signedBy: string;
  signedAll: string;
  signedNone: string;
  members: string;
  by: string;
};
const fr: Copy = {
  title: "Commission",
  intro: "Le journal des décisions de la commission : celles que l'application inscrit d'elle-même (transferts, forces majeures, amendes, transferts internationaux) et celles que vous ajoutez. Chaque membre signe en son nom.",
  none: "Aucune décision pour l'instant.",
  record: "Inscrire une décision",
  kind: "Objet",
  kinds: { transfer: "Transfert", force_majeure: "Force majeure", fine: "Amende", international: "Transfert international", discipline: "Discipline", other: "Autre" },
  subject: "Qui ou quoi",
  decision: "Décision",
  reference: "Référence (facultatif)",
  decidedOn: "Date",
  save: "Inscrire",
  cancel: "Annuler",
  saved: "Inscrit.",
  sign: "Signer",
  unsign: "Retirer ma signature",
  signedBy: "Signé par {names}",
  signedAll: "Signée par toute la commission",
  signedNone: "Pas encore signée",
  members: "Membres de la commission : {names}",
  by: "inscrite par {name}",
};
const nl: Copy = {
  title: "Commissie",
  intro: "Het dagboek van de beslissingen van de commissie: die de toepassing zelf inschrijft (transfers, overmacht, boetes, internationale transfers) en die u toevoegt. Elk lid tekent in eigen naam.",
  none: "Nog geen beslissing.",
  record: "Een beslissing inschrijven",
  kind: "Onderwerp",
  kinds: { transfer: "Transfer", force_majeure: "Overmacht", fine: "Boete", international: "Internationale transfer", discipline: "Tucht", other: "Andere" },
  subject: "Wie of wat",
  decision: "Beslissing",
  reference: "Referentie (optioneel)",
  decidedOn: "Datum",
  save: "Inschrijven",
  cancel: "Annuleren",
  saved: "Ingeschreven.",
  sign: "Tekenen",
  unsign: "Mijn handtekening intrekken",
  signedBy: "Getekend door {names}",
  signedAll: "Getekend door de hele commissie",
  signedNone: "Nog niet getekend",
  members: "Leden van de commissie: {names}",
  by: "ingeschreven door {name}",
};
const en: Copy = {
  title: "Commission",
  intro: "The journal of the commission's decisions: those the app records on its own (transfers, force majeure, fines, international transfers) and those you add. Each member signs in their own name.",
  none: "No decision yet.",
  record: "Record a decision",
  kind: "Subject",
  kinds: { transfer: "Transfer", force_majeure: "Force majeure", fine: "Fine", international: "International transfer", discipline: "Discipline", other: "Other" },
  subject: "Who or what",
  decision: "Decision",
  reference: "Reference (optional)",
  decidedOn: "Date",
  save: "Record",
  cancel: "Cancel",
  saved: "Recorded.",
  sign: "Sign",
  unsign: "Withdraw my signature",
  signedBy: "Signed by {names}",
  signedAll: "Signed by the whole commission",
  signedNone: "Not signed yet",
  members: "Members of the commission: {names}",
  by: "recorded by {name}",
};
export const commissionCopy: Record<Locale, Copy> = { fr, nl, en };
