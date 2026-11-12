import type { Locale } from "@/lib/locale";

/** 12/11/2026: the « Fédération » page of a club. */
type Copy = {
  title: string;
  subtitle: string;
  none: string;
  noneAction: string;
  contact: string;
  circulars: string;
  circularsNone: string;
  unread: string;
  toAcknowledge: string;
  acknowledged: string;
  allCirculars: string;
  tournaments: string;
  tournamentsNone: string;
  nextDay: string;
  days: string;
  allTournaments: string;
  transfers: string;
  transfersNone: string;
  moved: string;
  joined: string;
  market: string;
  discipline: string;
  sanctions: string;
  appealable: string;
  finesDue: string;
  allDiscipline: string;
  clubs: string;
  clubsIntro: string;
  yours: string;
  president: string;
  presidents: string;
  noPresident: string;
  founded: string;
  hall: string;
  home: string;
  noHome: string;
  titles: string;
  lastTitle: string;
  loading: string;
};

const fr: Copy = {
  title: "Fédération",
  subtitle: "Les circulaires, les tournois, les transferts et les clubs de {name}.",
  none: "Le club n'est rattaché à aucune fédération.",
  noneAction: "Demander une affiliation",
  contact: "Écrire à la fédération",
  circulars: "Circulaires",
  circularsNone: "Aucune circulaire reçue.",
  unread: "{n} non lue(s)",
  toAcknowledge: "Accusé de réception demandé",
  acknowledged: "Reçue",
  allCirculars: "Toutes les circulaires",
  tournaments: "Tournois de la fédération",
  tournamentsNone: "Aucun tournoi ouvert.",
  nextDay: "Prochaine journée le {day}",
  days: "{n} journée(s)",
  allTournaments: "Tous les tournois",
  transfers: "Actualités des transferts",
  transfersNone: "Aucun transfert validé ces six derniers mois.",
  moved: "{name} : {from} vers {to}",
  joined: "{name} rejoint {to}",
  market: "Marché des transferts",
  discipline: "Discipline du club",
  sanctions: "Sanctions sur 12 mois",
  appealable: "En délai d'appel",
  finesDue: "Amendes à payer",
  allDiscipline: "Ouvrir la discipline",
  clubs: "Les clubs de la fédération",
  clubsIntro: "{n} club(s) affilié(s).",
  yours: "Votre club",
  president: "Président",
  presidents: "Présidence",
  noPresident: "Présidence à pourvoir",
  founded: "Créé en {year}",
  hall: "Salle",
  home: "Salle : {name}",
  noHome: "Salle non renseignée",
  titles: "{n} titre(s)",
  lastTitle: "Dernier : {title}",
  loading: "Chargement…",
};
const nl: Copy = {
  title: "Federatie",
  subtitle: "De omzendbrieven, de toernooien, de transfers en de clubs van {name}.",
  none: "De club is bij geen enkele federatie aangesloten.",
  noneAction: "Een aansluiting aanvragen",
  contact: "De federatie schrijven",
  circulars: "Omzendbrieven",
  circularsNone: "Geen omzendbrief ontvangen.",
  unread: "{n} ongelezen",
  toAcknowledge: "Ontvangstbevestiging gevraagd",
  acknowledged: "Ontvangen",
  allCirculars: "Alle omzendbrieven",
  tournaments: "Toernooien van de federatie",
  tournamentsNone: "Geen open toernooi.",
  nextDay: "Volgende speeldag op {day}",
  days: "{n} speeldag(en)",
  allTournaments: "Alle toernooien",
  transfers: "Transfernieuws",
  transfersNone: "Geen gevalideerde transfer de voorbije zes maanden.",
  moved: "{name}: van {from} naar {to}",
  joined: "{name} komt bij {to}",
  market: "Transfermarkt",
  discipline: "Tucht van de club",
  sanctions: "Sancties op 12 maanden",
  appealable: "Binnen de beroepstermijn",
  finesDue: "Te betalen boetes",
  allDiscipline: "De tucht openen",
  clubs: "De clubs van de federatie",
  clubsIntro: "{n} aangesloten club(s).",
  yours: "Uw club",
  president: "Voorzitter",
  presidents: "Voorzitterschap",
  noPresident: "Voorzitterschap vacant",
  founded: "Opgericht in {year}",
  hall: "Zaal",
  home: "Zaal: {name}",
  noHome: "Zaal niet opgegeven",
  titles: "{n} titel(s)",
  lastTitle: "Laatste: {title}",
  loading: "Laden…",
};
const en: Copy = {
  title: "Federation",
  subtitle: "The circulars, tournaments, transfers and clubs of {name}.",
  none: "The club is affiliated with no federation.",
  noneAction: "Ask for an affiliation",
  contact: "Write to the federation",
  circulars: "Circulars",
  circularsNone: "No circular received.",
  unread: "{n} unread",
  toAcknowledge: "Acknowledgement asked",
  acknowledged: "Received",
  allCirculars: "All circulars",
  tournaments: "Federation tournaments",
  tournamentsNone: "No open tournament.",
  nextDay: "Next day on {day}",
  days: "{n} day(s)",
  allTournaments: "All tournaments",
  transfers: "Transfer news",
  transfersNone: "No transfer validated in the last six months.",
  moved: "{name}: {from} to {to}",
  joined: "{name} joins {to}",
  market: "Transfer market",
  discipline: "Club discipline",
  sanctions: "Sanctions over 12 months",
  appealable: "Within the appeal period",
  finesDue: "Fines to pay",
  allDiscipline: "Open discipline",
  clubs: "The federation's clubs",
  clubsIntro: "{n} affiliated club(s).",
  yours: "Your club",
  president: "President",
  presidents: "Presidency",
  noPresident: "Presidency vacant",
  founded: "Founded in {year}",
  hall: "Hall",
  home: "Hall: {name}",
  noHome: "Hall not given",
  titles: "{n} title(s)",
  lastTitle: "Latest: {title}",
  loading: "Loading…",
};

export const clubFederationCopy: Record<Locale, Copy> = { fr, nl, en };
