import type { Locale } from "@/lib/locale";

/** International, step 3 (06/11/2026): the federation's registry of classifications. */
type Copy = {
  title: string;
  intro: string;
  search: string;
  players: string;
  playersNone: string;
  columns: { player: string; club: string; identity: string; sheet: string; registry: string };
  noRecord: string;
  recordLine: string;
  until: string;
  expiring: string;
  international: string;
  sources: Record<"session" | "manual" | "dossier", string>;
  records: string;
  recordsNone: string;
  add: string;
  addIntro: string;
  who: string;
  whoPlayer: string;
  whoCode: string;
  codeHint: string;
  classification: string;
  decidedOn: string;
  validUntil: string;
  classifier: string;
  internationalFlag: string;
  note: string;
  save: string;
  saved: string;
  remove: string;
  removed: string;
  readOnly: string;
};
const fr: Copy = {
  title: "Registre des classifications",
  intro: "Chaque décision PF1 ou PF2 est inscrite au nom de la personne, avec la fédération qui a classifié, sa date et sa fin. Elle suit la personne de club en club et de pays en pays : les fiches de vos clubs se mettent à jour d'elles-mêmes. Les journées de classification y écrivent ; vous ajoutez à la main une classification faite ailleurs.",
  search: "Rechercher un joueur, un code ou un club",
  players: "Joueurs de vos clubs",
  playersNone: "Aucun joueur.",
  columns: { player: "Joueur", club: "Club", identity: "Code d'identité", sheet: "Fiche", registry: "Registre" },
  noRecord: "Aucune inscription",
  recordLine: "{classification} · {federation} · {day}",
  until: "jusqu'au {day}",
  expiring: "Expire sous 90 jours",
  international: "Reconnue de l'étranger",
  sources: { session: "Journée de classification", manual: "Inscrite à la main", dossier: "Dossier de transfert" },
  records: "Inscriptions",
  recordsNone: "Aucune inscription.",
  add: "Inscrire une classification",
  addIntro: "Pour une classification faite ailleurs (autre fédération, tournoi international) ou antérieure à la plateforme.",
  who: "Personne",
  whoPlayer: "Un joueur de vos clubs",
  whoCode: "Par code d'identité",
  codeHint: "Le code PFM-XXXXXXXXXX figure sur la fiche du joueur et dans un dossier de transfert.",
  classification: "Classification",
  decidedOn: "Décidée le",
  validUntil: "Valable jusqu'au (facultatif)",
  classifier: "Classificateur ou organe (facultatif)",
  internationalFlag: "Classification internationale",
  note: "Note (facultatif)",
  save: "Inscrire",
  saved: "Classification inscrite.",
  remove: "Retirer",
  removed: "Inscription retirée.",
  readOnly: "Lecture seule : la présidence et les délégués aux licences écrivent au registre.",
};
const nl: Copy = {
  title: "Register van classificaties",
  intro: "Elke PF1- of PF2-beslissing wordt op naam van de persoon ingeschreven, met de federatie die classificeerde, de datum en het einde. Ze volgt de persoon van club naar club en van land naar land: de fiches van uw clubs worden vanzelf bijgewerkt. Classificatiedagen schrijven erin; u voegt met de hand een elders gedane classificatie toe.",
  search: "Een speler, een code of een club zoeken",
  players: "Spelers van uw clubs",
  playersNone: "Geen speler.",
  columns: { player: "Speler", club: "Club", identity: "Identiteitscode", sheet: "Fiche", registry: "Register" },
  noRecord: "Geen inschrijving",
  recordLine: "{classification} · {federation} · {day}",
  until: "tot {day}",
  expiring: "Vervalt binnen 90 dagen",
  international: "Erkend uit het buitenland",
  sources: { session: "Classificatiedag", manual: "Met de hand ingeschreven", dossier: "Transferdossier" },
  records: "Inschrijvingen",
  recordsNone: "Geen inschrijving.",
  add: "Een classificatie inschrijven",
  addIntro: "Voor een classificatie die elders gebeurde (andere federatie, internationaal toernooi) of van voor het platform.",
  who: "Persoon",
  whoPlayer: "Een speler van uw clubs",
  whoCode: "Via identiteitscode",
  codeHint: "De code PFM-XXXXXXXXXX staat op de fiche van de speler en in een transferdossier.",
  classification: "Classificatie",
  decidedOn: "Beslist op",
  validUntil: "Geldig tot (facultatief)",
  classifier: "Classificeerder of orgaan (facultatief)",
  internationalFlag: "Internationale classificatie",
  note: "Nota (facultatief)",
  save: "Inschrijven",
  saved: "Classificatie ingeschreven.",
  remove: "Verwijderen",
  removed: "Inschrijving verwijderd.",
  readOnly: "Alleen lezen: het voorzitterschap en de afgevaardigden voor de licenties schrijven in het register.",
};
const en: Copy = {
  title: "Registry of classifications",
  intro: "Every PF1 or PF2 decision is written in the person's name, with the federation that classified, its date and its end. It follows the person from club to club and from country to country: the sheets of your clubs update by themselves. Classification days write to it; you add by hand a classification done elsewhere.",
  search: "Search a player, a code or a club",
  players: "Players of your clubs",
  playersNone: "No player.",
  columns: { player: "Player", club: "Club", identity: "Identity code", sheet: "Sheet", registry: "Registry" },
  noRecord: "No record",
  recordLine: "{classification} · {federation} · {day}",
  until: "until {day}",
  expiring: "Expires within 90 days",
  international: "Recognised from abroad",
  sources: { session: "Classification day", manual: "Written by hand", dossier: "Transfer dossier" },
  records: "Records",
  recordsNone: "No record.",
  add: "Record a classification",
  addIntro: "For a classification done elsewhere (another federation, an international tournament) or before the platform.",
  who: "Person",
  whoPlayer: "A player of your clubs",
  whoCode: "By identity code",
  codeHint: "The code PFM-XXXXXXXXXX is on the player's sheet and in a transfer dossier.",
  classification: "Classification",
  decidedOn: "Decided on",
  validUntil: "Valid until (optional)",
  classifier: "Classifier or body (optional)",
  internationalFlag: "International classification",
  note: "Note (optional)",
  save: "Record",
  saved: "Classification recorded.",
  remove: "Remove",
  removed: "Record removed.",
  readOnly: "Read only: the presidency and the licence delegates write to the registry.",
};
export const classificationRegistryCopy: Record<Locale, Copy> = { fr, nl, en };
