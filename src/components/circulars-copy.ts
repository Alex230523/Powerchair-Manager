import type { Locale } from "@/lib/locale";

/** 33: the federation's circulars, on the side of who receives them and of the federation's communication. */
type Copy = {
  title: string;
  intro: string;
  mine: string;
  none: string;
  unread: string;
  toAck: string;
  acked: string;
  ack: string;
  ackDone: string;
  back: string;
  files: string;
  compose: string;
  newOne: string;
  subject: string;
  body: string;
  audiences: string;
  audience: Record<"presidents" | "coaches" | "referees" | "members", string>;
  clubs: string;
  clubsHelp: string;
  ackRequired: string;
  sendAt: string;
  sendAtHelp: string;
  save: string;
  saved: string;
  send: string;
  sent: string;
  scheduled: string;
  remove: string;
  attach: string;
  attachHelp: string;
  sentList: string;
  status: Record<"draft" | "scheduled" | "sent", string>;
  rate: string;
  ackRate: string;
  followUp: string;
  waiting: string;
  remind: string;
  reminded: string;
  export: string;
  teamTitle: string;
  teamIntro: string;
};
const fr: Copy = {
  title: "Circulaires",
  intro: "Les communications officielles de la fédération.",
  mine: "Reçues",
  none: "Aucune circulaire pour l'instant.",
  unread: "Non lue",
  toAck: "Accusé de lecture demandé",
  acked: "Lecture confirmée",
  ack: "J'ai lu",
  ackDone: "Lecture confirmée.",
  back: "Toutes les circulaires",
  files: "Pièces jointes",
  compose: "Rédiger une circulaire",
  newOne: "Nouvelle circulaire",
  subject: "Titre",
  body: "Texte",
  audiences: "Destinataires",
  audience: { presidents: "Présidents de club", coaches: "Coachs", referees: "Arbitres", members: "Tous les membres" },
  clubs: "Clubs",
  clubsHelp: "Aucun club coché : tous les clubs affiliés.",
  ackRequired: "Accusé de lecture obligatoire",
  sendAt: "Date d'envoi",
  sendAtHelp: "Vide : à l'envoi.",
  save: "Enregistrer le brouillon",
  saved: "Brouillon enregistré.",
  send: "Envoyer",
  sent: "Circulaire envoyée à {n} personnes.",
  scheduled: "Circulaire programmée.",
  remove: "Supprimer",
  attach: "Ajouter une pièce jointe",
  attachHelp: "PDF, PNG ou JPEG, 5 Mo au plus.",
  sentList: "Circulaires de la fédération",
  status: { draft: "Brouillon", scheduled: "Programmée", sent: "Envoyée" },
  rate: "Lue par {read} sur {total}",
  ackRate: "{n} accusés de lecture",
  followUp: "Suivi par club",
  waiting: "En attente : {names}",
  remind: "Relancer les non-lus",
  reminded: "{n} personnes relancées.",
  export: "Exporter (CSV)",
  teamTitle: "Équipe fédérale",
  teamIntro: "Les délégués de la présidence et leurs rôles : chacun ne voit que ce que ses compétences lui ouvrent.",
};
const nl: Copy = {
  title: "Omzendbrieven",
  intro: "De officiële communicatie van de federatie.",
  mine: "Ontvangen",
  none: "Nog geen omzendbrief.",
  unread: "Ongelezen",
  toAck: "Leesbevestiging gevraagd",
  acked: "Lezing bevestigd",
  ack: "Ik heb gelezen",
  ackDone: "Lezing bevestigd.",
  back: "Alle omzendbrieven",
  files: "Bijlagen",
  compose: "Een omzendbrief schrijven",
  newOne: "Nieuwe omzendbrief",
  subject: "Titel",
  body: "Tekst",
  audiences: "Ontvangers",
  audience: { presidents: "Clubvoorzitters", coaches: "Coaches", referees: "Scheidsrechters", members: "Alle leden" },
  clubs: "Clubs",
  clubsHelp: "Geen club aangevinkt: alle aangesloten clubs.",
  ackRequired: "Leesbevestiging verplicht",
  sendAt: "Verzenddatum",
  sendAtHelp: "Leeg: bij verzending.",
  save: "Het ontwerp opslaan",
  saved: "Ontwerp opgeslagen.",
  send: "Verzenden",
  sent: "Omzendbrief verzonden naar {n} personen.",
  scheduled: "Omzendbrief gepland.",
  remove: "Verwijderen",
  attach: "Een bijlage toevoegen",
  attachHelp: "Pdf, PNG of JPEG, hoogstens 5 MB.",
  sentList: "Omzendbrieven van de federatie",
  status: { draft: "Ontwerp", scheduled: "Gepland", sent: "Verzonden" },
  rate: "Gelezen door {read} van {total}",
  ackRate: "{n} leesbevestigingen",
  followUp: "Opvolging per club",
  waiting: "Wacht nog: {names}",
  remind: "Niet-lezers herinneren",
  reminded: "{n} personen herinnerd.",
  export: "Exporteren (CSV)",
  teamTitle: "Federaal team",
  teamIntro: "De gedelegeerden van het voorzitterschap en hun rollen: elk ziet alleen wat zijn bevoegdheden openen.",
};
const en: Copy = {
  title: "Circulars",
  intro: "The federation's official communications.",
  mine: "Received",
  none: "No circular yet.",
  unread: "Unread",
  toAck: "Read receipt asked",
  acked: "Reading confirmed",
  ack: "I have read it",
  ackDone: "Reading confirmed.",
  back: "All circulars",
  files: "Attachments",
  compose: "Write a circular",
  newOne: "New circular",
  subject: "Title",
  body: "Text",
  audiences: "Recipients",
  audience: { presidents: "Club presidents", coaches: "Coaches", referees: "Referees", members: "All members" },
  clubs: "Clubs",
  clubsHelp: "No club ticked: every affiliated club.",
  ackRequired: "Read receipt required",
  sendAt: "Sending date",
  sendAtHelp: "Empty: when sent.",
  save: "Save the draft",
  saved: "Draft saved.",
  send: "Send",
  sent: "Circular sent to {n} people.",
  scheduled: "Circular scheduled.",
  remove: "Delete",
  attach: "Add an attachment",
  attachHelp: "PDF, PNG or JPEG, 5 MB at most.",
  sentList: "The federation's circulars",
  status: { draft: "Draft", scheduled: "Scheduled", sent: "Sent" },
  rate: "Read by {read} of {total}",
  ackRate: "{n} read receipts",
  followUp: "Follow-up by club",
  waiting: "Waiting: {names}",
  remind: "Remind the unread",
  reminded: "{n} people reminded.",
  export: "Export (CSV)",
  teamTitle: "Federation team",
  teamIntro: "The presidency's delegates and their roles: each sees only what his competences open.",
};
export const circularsCopy: Record<Locale, Copy> = { fr, nl, en };
