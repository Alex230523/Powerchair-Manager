import type { Locale } from "@/lib/locale";

/** 13/11/2026: « Mon équipe nationale », the national staff's own page. */
type Copy = {
  title: string;
  intro: string;
  loading: string;
  none: string;
  myRoles: string;
  staff: string;
  players: string;
  colPlayer: string;
  colClub: string;
  colStatus: string;
  colClass: string;
  colAnswer: string;
  colCare: string;
  careShared: string;
  careNotShared: string;
  noPlayers: string;
  gatherings: string;
  noGatherings: string;
  answers: string;
  whoComes: string;
  responses: Record<string, string>;
  care: string;
  careIntro: string;
  careShow: string;
  careHide: string;
  careNone: string;
  careUntil: string;
  careFailed: string;
};

const fr: Copy = {
  title: "Mon équipe nationale",
  intro: "Les équipes nationales dont vous faites partie du staff : les joueurs, leurs réponses et les rassemblements. Lecture seule ; la fédération compose l'équipe.",
  loading: "Chargement…",
  none: "Vous ne faites partie du staff d'aucune équipe nationale en cours.",
  myRoles: "Votre rôle : {roles}",
  staff: "Staff",
  players: "Joueurs",
  colPlayer: "Joueur",
  colClub: "Club",
  colStatus: "Statut",
  colClass: "Classification",
  colAnswer: "Disponibilité",
  colCare: "Consignes de soin",
  careShared: "Partagées",
  careNotShared: "Non partagées",
  noPlayers: "Aucun joueur sélectionné pour l'instant.",
  gatherings: "Rassemblements",
  noGatherings: "Aucun rassemblement prévu.",
  answers: "Présents : {present}, absents : {absent}, sans réponse : {none}",
  whoComes: "Qui vient : {title}",
  responses: { present: "Présent", absent: "Absent", none: "Pas encore répondu" },
  care: "Consignes de soin",
  careIntro: "Seulement pour les joueurs qui ont donné leur accord, pendant la période choisie. Données de santé : chaque consultation est notée dans le journal du club du joueur.",
  careShow: "Afficher les consignes de soin",
  careHide: "Masquer les consignes de soin",
  careNone: "Aucune consigne partagée en ce moment.",
  careUntil: "Accord jusqu'au {day}",
  careFailed: "Les consignes n'ont pas pu être chargées. Réessayez dans un instant.",
};
const nl: Copy = {
  title: "Mijn nationale ploeg",
  intro: "De nationale ploegen waarvan u deel uitmaakt van de staf: de spelers, hun antwoorden en de samenkomsten. Alleen lezen; de federatie stelt de ploeg samen.",
  loading: "Laden…",
  none: "U maakt geen deel uit van de staf van een lopende nationale ploeg.",
  myRoles: "Uw rol: {roles}",
  staff: "Staf",
  players: "Spelers",
  colPlayer: "Speler",
  colClub: "Club",
  colStatus: "Status",
  colClass: "Classificatie",
  colAnswer: "Beschikbaarheid",
  colCare: "Zorginstructies",
  careShared: "Gedeeld",
  careNotShared: "Niet gedeeld",
  noPlayers: "Nog geen speler geselecteerd.",
  gatherings: "Samenkomsten",
  noGatherings: "Geen samenkomst gepland.",
  answers: "Aanwezig: {present}, afwezig: {absent}, zonder antwoord: {none}",
  whoComes: "Wie komt: {title}",
  responses: { present: "Aanwezig", absent: "Afwezig", none: "Nog niet geantwoord" },
  care: "Zorginstructies",
  careIntro: "Alleen voor de spelers die toestemming gaven, tijdens de gekozen periode. Gezondheidsgegevens: elke raadpleging wordt genoteerd in het logboek van de club van de speler.",
  careShow: "Zorginstructies tonen",
  careHide: "Zorginstructies verbergen",
  careNone: "Momenteel geen gedeelde instructies.",
  careUntil: "Toestemming tot {day}",
  careFailed: "De instructies konden niet geladen worden. Probeer het zo meteen opnieuw.",
};
const en: Copy = {
  title: "My national team",
  intro: "The national teams whose staff you are on: the players, their answers and the gatherings. Read only; the federation picks the team.",
  loading: "Loading…",
  none: "You are not on the staff of any current national team.",
  myRoles: "Your role: {roles}",
  staff: "Staff",
  players: "Players",
  colPlayer: "Player",
  colClub: "Club",
  colStatus: "Status",
  colClass: "Classification",
  colAnswer: "Availability",
  colCare: "Care instructions",
  careShared: "Shared",
  careNotShared: "Not shared",
  noPlayers: "No player selected yet.",
  gatherings: "Gatherings",
  noGatherings: "No gathering planned.",
  answers: "Present: {present}, absent: {absent}, no answer: {none}",
  whoComes: "Who comes: {title}",
  responses: { present: "Present", absent: "Absent", none: "No answer yet" },
  care: "Care instructions",
  careIntro: "Only for the players who agreed, during the period they chose. Health data: each reading is noted in the journal of the player's club.",
  careShow: "Show the care instructions",
  careHide: "Hide the care instructions",
  careNone: "No instructions shared at the moment.",
  careUntil: "Agreement until {day}",
  careFailed: "The instructions could not be loaded. Try again in a moment.",
};

export const nationalStaffCopy: Record<Locale, Copy> = { fr, nl, en };
