import type { Locale } from "@/lib/locale";

/** 15: the home by role. */
export const focusCopy: Record<
  Locale,
  {
    nextFor: string;
    next: string;
    noNext: string;
    present: string;
    absent: string;
    answered: Record<string, string>;
    closed: string;
    results: string;
    noResults: string;
    seeCalendar: string;
    seeMatches: string;
    team: string;
    nextTraining: string;
    nextMatch: string;
    nothingPlanned: string;
    answers: string;
    /** 13/11/2026: the coaches apart, and the coach's own answer. */
    staffAnswers: string;
    mine: string;
    mineOf: string;
    call: string;
    openMatch: string;
    noTeam: string;
    lateClubs: string;
    lateClubsNone: string;
    classificationDays: string;
    tournamentDays: string;
    pending: string;
    pendingPlaces: string;
    pendingModels: string;
    pendingCourses: string;
    clubs: string;
    clubsLine: string;
    licences: string;
    licencesNone: string;
    licenceCategories: Record<string, string>;
    toDo: string;
    classificationsToDo: string;
    matchesWithoutReferee: string;
    disciplineProposed: string;
    chairs: string;
    reportChair: string;
    reportChairs: string;
    disciplineAppeals: string;
    reportsPending: string;
    nothingToDo: string;
    nothingPending: string;
    seeAll: string;
    saved: string;
    failed: string;
  }
> = {
  fr: {
    nextFor: "Prochain rendez-vous de {name}",
    next: "Mon prochain rendez-vous",
    noNext: "Aucun rendez-vous à venir.",
    present: "Présent",
    absent: "Absent",
    answered: { present: "Vous avez répondu : présent.", absent: "Vous avez répondu : absent.", uncertain: "Vous avez répondu : incertain.", none: "Pas encore de réponse." },
    closed: "Les réponses sont fermées.",
    results: "Derniers résultats",
    noResults: "Pas encore de match joué.",
    seeCalendar: "Voir le calendrier",
    seeMatches: "Tous les matchs",
    team: "Équipe {name}",
    nextTraining: "Prochain entraînement",
    nextMatch: "Prochain match",
    nothingPlanned: "Rien de prévu.",
    answers: "{answered} réponses sur {invited}, {present} présents",
    staffAnswers: "Coachs : {present} présents sur {invited}",
    mine: "Ma présence",
    mineOf: "Ma présence : {title}",
    call: "Faire l'appel",
    openMatch: "Ouvrir le match",
    noTeam: "Aucune équipe suivie pour le moment.",
    lateClubs: "Clubs en retard d'affiliation",
    lateClubsNone: "Aucun club en retard.",
    classificationDays: "Journées de classification",
    tournamentDays: "Journées de tournoi",
    pending: "À valider",
    pendingPlaces: "{n} lieux proposés au répertoire",
    pendingModels: "{n} modèles de fauteuil proposés",
    pendingCourses: "{n} demandes de formation",
    clubs: "Clubs affiliés",
    clubsLine: "{affiliated} clubs · {pending} sans présidence active",
    licences: "Licenciés par saison",
    licencesNone: "Aucune licence active.",
    licenceCategories: { player: "joueurs", coach: "coachs" },
    toDo: "À traiter",
    classificationsToDo: "{n} classifications demandées",
    matchesWithoutReferee: "{n} matchs sans arbitre désigné",
    disciplineProposed: "{n} sanction(s) à décider",
    chairs: "Fauteuils",
    reportChair: "Signaler un problème",
    reportChairs: "Signaler un problème sur un fauteuil",
    disciplineAppeals: "{n} recours ouvert(s)",
    reportsPending: "{n} rapports de match en attente",
    nothingToDo: "Rien à traiter.",
    nothingPending: "Rien à faire, tout est en ordre.",
    seeAll: "Voir tout",
    saved: "Réponse enregistrée.",
    failed: "La réponse n'a pas pu être enregistrée.",
  },
  nl: {
    nextFor: "Volgende afspraak van {name}",
    next: "Mijn volgende afspraak",
    noNext: "Geen komende afspraak.",
    present: "Aanwezig",
    absent: "Afwezig",
    answered: { present: "U antwoordde: aanwezig.", absent: "U antwoordde: afwezig.", uncertain: "U antwoordde: onzeker.", none: "Nog geen antwoord." },
    closed: "De antwoorden zijn gesloten.",
    results: "Laatste uitslagen",
    noResults: "Nog geen gespeelde wedstrijd.",
    seeCalendar: "De kalender bekijken",
    seeMatches: "Alle wedstrijden",
    team: "Team {name}",
    nextTraining: "Volgende training",
    nextMatch: "Volgende wedstrijd",
    nothingPlanned: "Niets gepland.",
    answers: "{answered} antwoorden op {invited}, {present} aanwezig",
    staffAnswers: "Coaches: {present} aanwezig op {invited}",
    mine: "Mijn aanwezigheid",
    mineOf: "Mijn aanwezigheid: {title}",
    call: "Aanwezigheden opnemen",
    openMatch: "De wedstrijd openen",
    noTeam: "Voorlopig geen gevolgd team.",
    lateClubs: "Clubs met achterstallige aansluiting",
    lateClubsNone: "Geen club met achterstand.",
    classificationDays: "Classificatiedagen",
    tournamentDays: "Toernooidagen",
    pending: "Te valideren",
    pendingPlaces: "{n} voorgestelde locaties voor het register",
    pendingModels: "{n} voorgestelde rolstoelmodellen",
    pendingCourses: "{n} opleidingsaanvragen",
    clubs: "Aangesloten clubs",
    clubsLine: "{affiliated} clubs · {pending} zonder actief voorzitterschap",
    licences: "Licentiehouders per seizoen",
    licencesNone: "Geen actieve licentie.",
    licenceCategories: { player: "spelers", coach: "coaches" },
    toDo: "Te behandelen",
    classificationsToDo: "{n} aangevraagde classificaties",
    matchesWithoutReferee: "{n} wedstrijden zonder scheidsrechter",
    disciplineProposed: "{n} sanctie(s) te beslissen",
    chairs: "Rolstoelen",
    reportChair: "Een probleem melden",
    reportChairs: "Een probleem met een rolstoel melden",
    disciplineAppeals: "{n} open beroep(en)",
    reportsPending: "{n} wedstrijdverslagen in afwachting",
    nothingToDo: "Niets te behandelen.",
    nothingPending: "Niets te doen, alles is in orde.",
    seeAll: "Alles bekijken",
    saved: "Antwoord opgeslagen.",
    failed: "Het antwoord kon niet worden opgeslagen.",
  },
  en: {
    nextFor: "{name}'s next appointment",
    next: "My next appointment",
    noNext: "No appointment ahead.",
    present: "Present",
    absent: "Absent",
    answered: { present: "You answered: present.", absent: "You answered: absent.", uncertain: "You answered: uncertain.", none: "No answer yet." },
    closed: "Answers are closed.",
    results: "Latest results",
    noResults: "No match played yet.",
    seeCalendar: "See the calendar",
    seeMatches: "All matches",
    team: "Team {name}",
    nextTraining: "Next training",
    nextMatch: "Next match",
    nothingPlanned: "Nothing planned.",
    answers: "{answered} answers out of {invited}, {present} present",
    staffAnswers: "Coaches: {present} present out of {invited}",
    mine: "My attendance",
    mineOf: "My attendance: {title}",
    call: "Take attendance",
    openMatch: "Open the match",
    noTeam: "No team followed for now.",
    lateClubs: "Clubs late on affiliation",
    lateClubsNone: "No club late.",
    classificationDays: "Classification days",
    tournamentDays: "Tournament days",
    pending: "To validate",
    pendingPlaces: "{n} places proposed for the directory",
    pendingModels: "{n} chair models proposed",
    pendingCourses: "{n} training requests",
    clubs: "Affiliated clubs",
    clubsLine: "{affiliated} clubs · {pending} without an active presidency",
    licences: "Licence holders by season",
    licencesNone: "No active licence.",
    licenceCategories: { player: "players", coach: "coaches" },
    toDo: "To handle",
    classificationsToDo: "{n} classifications asked",
    matchesWithoutReferee: "{n} matches without a referee",
    disciplineProposed: "{n} sanction(s) to decide",
    chairs: "Chairs",
    reportChair: "Report a problem",
    reportChairs: "Report a problem with a chair",
    disciplineAppeals: "{n} open appeal(s)",
    reportsPending: "{n} match reports pending",
    nothingToDo: "Nothing to handle.",
    nothingPending: "Nothing to do, all in order.",
    seeAll: "See all",
    saved: "Answer saved.",
    failed: "The answer could not be saved.",
  },
};
