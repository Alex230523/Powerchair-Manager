import type { Locale } from "../lib/locale";

const fr = {
  refereeTitle: "Mon espace arbitre",
  refereeIntro:
    "Vos disponibilités, vos désignations et vos rapports de match.",
  guideGame: "Le jeu en une page",
  guideChair: "Le fauteuil de match",
  designTitle: "Désignations des arbitres",
  designIntro:
    "Matchs de championnat et de coupe des clubs affiliés. Désignez un arbitre (les disponibilités indiquées par les arbitres sont affichées).",
  loading: "Chargement…",
  unavailable: "Page indisponible pour le moment.",
  denied:
    "Choisissez votre profil d'arbitre (ou de fédération) pour ouvrir cette page.",
  availability: "Mes disponibilités",
  availabilityHint: "Cochez les samedis et dimanches où vous pouvez arbitrer.",
  available: "Disponible",
  saveAvailability: "Enregistrer mes disponibilités",
  saved: "Enregistré.",
  assignments: "Mes désignations",
  noAssignment: "Aucune désignation.",
  roles: {
    main: "Arbitre principal",
    assistant: "Assistant",
    table: "Table de marque",
  } as Record<string, string>,
  statuses: {
    proposed: "À confirmer",
    accepted: "Acceptée",
    declined: "Refusée",
    withdrawn: "Retirée",
  } as Record<string, string>,
  accept: "Accepter",
  decline: "Refuser",
  report: "Rapport de match",
  homeScore: "Score à domicile",
  awayScore: "Score visiteurs",
  incidents: "Incidents, cartons, remarques",
  sendReport: "Envoyer le rapport",
  reportSent: "Rapport envoyé.",
  reportDone: "Rapport envoyé",
  kinds: {
    league: "Championnat",
    cup: "Coupe",
    tournament: "Tournoi",
    friendly: "Amical",
  } as Record<string, string>,
  noMatch: "Aucun match officiel à venir.",
  referee: "Arbitre",
  role: "Rôle",
  assign: "Désigner",
  withdraw: "Retirer",
  availableOn: "disponible ce jour",
  unavailableOn: "indisponible ce jour",
  unknown: "disponibilité non indiquée",
  readOnly: "Lecture seule.",
  noReferee:
    "Aucun arbitre dans la fédération. Invitez-les avec le rôle Arbitre depuis Mon espace.",
  errors: {
    NOT_ACCEPTED: "Acceptez d'abord la désignation.",
    NOT_PLAYED_YET: "Le rapport peut être envoyé après le match.",
  } as Record<string, string>,
};
type Copy = typeof fr;
const nl: Copy = {
  refereeTitle: "Mijn scheidsrechtersruimte",
  refereeIntro: "Uw beschikbaarheden, aanduidingen en wedstrijdverslagen.",
  guideGame: "Het spel op één pagina",
  guideChair: "De wedstrijdrolstoel",
  designTitle: "Aanduiding van scheidsrechters",
  designIntro:
    "Competitie- en bekerwedstrijden van de aangesloten clubs. Duid een scheidsrechter aan (de opgegeven beschikbaarheden worden getoond).",
  loading: "Laden…",
  unavailable: "Pagina momenteel niet beschikbaar.",
  denied:
    "Kies uw scheidsrechters- of federatieprofiel om deze pagina te openen.",
  availability: "Mijn beschikbaarheden",
  availabilityHint: "Vink de zaterdagen en zondagen aan waarop u kunt fluiten.",
  available: "Beschikbaar",
  saveAvailability: "Beschikbaarheden opslaan",
  saved: "Opgeslagen.",
  assignments: "Mijn aanduidingen",
  noAssignment: "Geen aanduidingen.",
  roles: {
    main: "Hoofdscheidsrechter",
    assistant: "Assistent",
    table: "Jurytafel",
  },
  statuses: {
    proposed: "Te bevestigen",
    accepted: "Aanvaard",
    declined: "Geweigerd",
    withdrawn: "Ingetrokken",
  },
  accept: "Aanvaarden",
  decline: "Weigeren",
  report: "Wedstrijdverslag",
  homeScore: "Score thuis",
  awayScore: "Score bezoekers",
  incidents: "Incidenten, kaarten, opmerkingen",
  sendReport: "Verslag versturen",
  reportSent: "Verslag verstuurd.",
  reportDone: "Verslag verstuurd",
  kinds: {
    league: "Competitie",
    cup: "Beker",
    tournament: "Toernooi",
    friendly: "Vriendschappelijk",
  },
  noMatch: "Geen komende officiële wedstrijden.",
  referee: "Scheidsrechter",
  role: "Rol",
  assign: "Aanduiden",
  withdraw: "Intrekken",
  availableOn: "beschikbaar die dag",
  unavailableOn: "niet beschikbaar die dag",
  unknown: "beschikbaarheid niet opgegeven",
  readOnly: "Alleen lezen.",
  noReferee:
    "Geen scheidsrechters in de federatie. Nodig hen uit met de rol Scheidsrechter via Mijn ruimte.",
  errors: {
    NOT_ACCEPTED: "Aanvaard eerst de aanduiding.",
    NOT_PLAYED_YET: "Het verslag kan na de wedstrijd verstuurd worden.",
  },
};
const en: Copy = {
  refereeTitle: "My referee space",
  refereeIntro: "Your availability, designations and match reports.",
  guideGame: "The game on one page",
  guideChair: "The match chair",
  designTitle: "Referee designations",
  designIntro:
    "League and cup matches of affiliated clubs. Designate a referee (availability given by referees is shown).",
  loading: "Loading…",
  unavailable: "Page unavailable right now.",
  denied: "Choose your referee (or federation) profile to open this page.",
  availability: "My availability",
  availabilityHint: "Tick the Saturdays and Sundays when you can referee.",
  available: "Available",
  saveAvailability: "Save my availability",
  saved: "Saved.",
  assignments: "My designations",
  noAssignment: "No designation.",
  roles: { main: "Main referee", assistant: "Assistant", table: "Score table" },
  statuses: {
    proposed: "To confirm",
    accepted: "Accepted",
    declined: "Declined",
    withdrawn: "Withdrawn",
  },
  accept: "Accept",
  decline: "Decline",
  report: "Match report",
  homeScore: "Home score",
  awayScore: "Away score",
  incidents: "Incidents, cards, remarks",
  sendReport: "Send report",
  reportSent: "Report sent.",
  reportDone: "Report sent",
  kinds: {
    league: "League",
    cup: "Cup",
    tournament: "Tournament",
    friendly: "Friendly",
  },
  noMatch: "No upcoming official match.",
  referee: "Referee",
  role: "Role",
  assign: "Designate",
  withdraw: "Withdraw",
  availableOn: "available that day",
  unavailableOn: "unavailable that day",
  unknown: "availability not given",
  readOnly: "Read only.",
  noReferee:
    "No referee in the federation. Invite them with the Referee role from My space.",
  errors: {
    NOT_ACCEPTED: "Accept the designation first.",
    NOT_PLAYED_YET: "The report can be sent after the match.",
  },
};
export const refereesCopy: Record<Locale, Copy> = { fr, nl, en };

/** Next weekend days (Saturday and Sunday) from a YYYY-MM-DD date. */
export function weekendDays(today: string, weeks = 10) {
  const out: string[] = [];
  const d = new Date(today + "T12:00:00Z");
  for (let i = 0; i < weeks * 7; i++) {
    const day = d.getUTCDay();
    if (day === 0 || day === 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
