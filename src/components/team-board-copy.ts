import type { Locale } from "@/lib/locale";

/** A6: the team page as a dashboard. */
export type TeamBoardCopy = {
  tab: string;
  ready: string;
  blocking: string;
  items: { licence: string; documents: string; noChair: string; chairRepair: string; chairService: string; dues: string };
  actions: string;
  convene: string;
  write: string;
  issueDues: string;
  prepareMatch: string;
  squad: string;
  squadIntro: string;
  emptySquad: string;
  licence: Record<"active" | "requested" | "suspended" | "refused" | "none", string>;
  documentsDue: string;
  documentsOk: string;
  chair: string;
  noChair: string;
  chairState: { ok: string; maintenance: string; service: string };
  duesLate: string;
  care: string;
  events: string;
  noEvent: string;
  answers: string;
  present: string;
  results: string;
  noResult: string;
  record: string;
  recordLine: string;
  attendance: string;
  attendanceValue: string;
  noAttendance: string;
  tasks: string;
  noTask: string;
  due: string;
  staff: string;
  noStaff: string;
  email: string;
  phone: string;
  kinds: Record<string, string>;
};

export const teamBoardCopy: Record<Locale, TeamBoardCopy> = {
  fr: {
    tab: "Tableau de bord",
    ready: "Rien ne bloque : l'équipe est en ordre.",
    blocking: "À régler avant le prochain rendez-vous",
    items: {
      licence: "{n} joueur(s) sans licence valide",
      documents: "{n} joueur(s) avec des documents à fournir",
      noChair: "{n} joueur(s) sans fauteuil attribué",
      chairRepair: "{n} fauteuil(s) en réparation",
      chairService: "{n} fauteuil(s) à réviser",
      dues: "{n} cotisation(s) en retard",
    },
    actions: "Actions rapides",
    convene: "Inviter l'équipe",
    write: "Écrire à l'équipe",
    issueDues: "Émettre les cotisations de l'équipe",
    prepareMatch: "Préparer le prochain match",
    squad: "État de l'effectif",
    squadIntro: "Licence de la saison, documents, fauteuil{money}{care}.",
    emptySquad: "Aucun joueur dans cette équipe pour l'instant : ajoutez-en depuis la fiche d'un joueur ou l'onglet Effectif.",
    licence: { active: "Licence valide", requested: "Licence demandée", suspended: "Licence suspendue", refused: "Licence refusée", none: "Pas de licence" },
    documentsDue: "{n} document(s) à fournir",
    documentsOk: "Documents en ordre",
    chair: "Fauteuil",
    noChair: "Pas de fauteuil",
    chairState: { ok: "en état", maintenance: "en réparation", service: "révision dépassée" },
    duesLate: "Cotisation en retard",
    care: "Consignes de soin",
    events: "Prochains rendez-vous",
    noEvent: "Aucun rendez-vous prévu.",
    answers: "{a} réponse(s) sur {n}",
    present: "{p} présent(s)",
    results: "Derniers résultats",
    noResult: "Aucun match joué pour l'instant.",
    record: "Bilan du championnat",
    recordLine: "{played} joué(s) · {won} victoire(s), {drawn} nul(s), {lost} défaite(s) · {scored} pour, {conceded} contre · {points} point(s)",
    attendance: "Présence sur 30 jours",
    attendanceValue: "{n} %",
    noAttendance: "Pas encore d'appel clôturé sur 30 jours.",
    tasks: "Tâches de l'équipe",
    noTask: "Aucune tâche en cours pour l'équipe.",
    due: "pour le {date}",
    staff: "Staff et contacts",
    noStaff: "Aucun coach ni accompagnateur.",
    email: "Écrire à {name}",
    phone: "Appeler {name}",
    kinds: { training: "Entraînement", friendly: "Match amical", tournament: "Tournoi", meeting: "Réunion", camp: "Stage", association: "Vie du club", custom: "Rendez-vous", league: "Championnat", cup: "Coupe" },
  },
  nl: {
    tab: "Dashboard",
    ready: "Niets blokkeert: het team is in orde.",
    blocking: "Te regelen vóór de volgende afspraak",
    items: {
      licence: "{n} speler(s) zonder geldige licentie",
      documents: "{n} speler(s) met ontbrekende documenten",
      noChair: "{n} speler(s) zonder toegewezen rolstoel",
      chairRepair: "{n} rolstoel(en) in herstelling",
      chairService: "{n} rolstoel(en) na te kijken",
      dues: "{n} lidgeld(en) achterstallig",
    },
    actions: "Snelle acties",
    convene: "Het team uitnodigen",
    write: "Het team schrijven",
    issueDues: "Lidgelden van het team aanmaken",
    prepareMatch: "Volgende wedstrijd voorbereiden",
    squad: "Stand van de selectie",
    squadIntro: "Licentie van het seizoen, documenten, rolstoel{money}{care}.",
    emptySquad: "Nog geen speler in dit team: voeg er toe vanuit een spelersfiche of het tabblad Selectie.",
    licence: { active: "Geldige licentie", requested: "Licentie aangevraagd", suspended: "Licentie geschorst", refused: "Licentie geweigerd", none: "Geen licentie" },
    documentsDue: "{n} document(en) te bezorgen",
    documentsOk: "Documenten in orde",
    chair: "Rolstoel",
    noChair: "Geen rolstoel",
    chairState: { ok: "in orde", maintenance: "in herstelling", service: "nazicht verlopen" },
    duesLate: "Lidgeld achterstallig",
    care: "Zorginstructies",
    events: "Volgende afspraken",
    noEvent: "Geen afspraak gepland.",
    answers: "{a} antwoord(en) op {n}",
    present: "{p} aanwezig",
    results: "Laatste uitslagen",
    noResult: "Nog geen wedstrijd gespeeld.",
    record: "Balans van de competitie",
    recordLine: "{played} gespeeld · {won} gewonnen, {drawn} gelijk, {lost} verloren · {scored} voor, {conceded} tegen · {points} punt(en)",
    attendance: "Aanwezigheid over 30 dagen",
    attendanceValue: "{n} %",
    noAttendance: "Nog geen afgesloten oproep over 30 dagen.",
    tasks: "Taken van het team",
    noTask: "Geen lopende taak voor het team.",
    due: "tegen {date}",
    staff: "Staf en contacten",
    noStaff: "Geen coach of begeleider.",
    email: "{name} schrijven",
    phone: "{name} bellen",
    kinds: { training: "Training", friendly: "Vriendschappelijke wedstrijd", tournament: "Tornooi", meeting: "Vergadering", camp: "Stage", association: "Clubleven", custom: "Afspraak", league: "Competitie", cup: "Beker" },
  },
  en: {
    tab: "Dashboard",
    ready: "Nothing is blocking: the team is in order.",
    blocking: "To sort out before the next meeting",
    items: {
      licence: "{n} player(s) without a valid licence",
      documents: "{n} player(s) with documents to provide",
      noChair: "{n} player(s) without a chair",
      chairRepair: "{n} chair(s) under repair",
      chairService: "{n} chair(s) due for service",
      dues: "{n} membership fee(s) late",
    },
    actions: "Quick actions",
    convene: "Invite the team",
    write: "Write to the team",
    issueDues: "Issue the team's membership fees",
    prepareMatch: "Prepare the next match",
    squad: "State of the squad",
    squadIntro: "Season licence, documents, chair{money}{care}.",
    emptySquad: "No player in this team yet: add some from a player's sheet or the Roster tab.",
    licence: { active: "Valid licence", requested: "Licence requested", suspended: "Licence suspended", refused: "Licence refused", none: "No licence" },
    documentsDue: "{n} document(s) to provide",
    documentsOk: "Documents in order",
    chair: "Chair",
    noChair: "No chair",
    chairState: { ok: "in order", maintenance: "under repair", service: "service overdue" },
    duesLate: "Fee late",
    care: "Care instructions",
    events: "Next meetings",
    noEvent: "Nothing planned.",
    answers: "{a} answer(s) out of {n}",
    present: "{p} present",
    results: "Latest results",
    noResult: "No match played yet.",
    record: "League record",
    recordLine: "{played} played · {won} won, {drawn} drawn, {lost} lost · {scored} for, {conceded} against · {points} point(s)",
    attendance: "Attendance over 30 days",
    attendanceValue: "{n} %",
    noAttendance: "No closed register over 30 days yet.",
    tasks: "The team's tasks",
    noTask: "No open task for the team.",
    due: "by {date}",
    staff: "Staff and contacts",
    noStaff: "No coach or helper.",
    email: "Write to {name}",
    phone: "Call {name}",
    kinds: { training: "Training", friendly: "Friendly match", tournament: "Tournament", meeting: "Meeting", camp: "Camp", association: "Club life", custom: "Meeting", league: "League", cup: "Cup" },
  },
};
/** The « money » and « care » parts of the squad's intro, only for those who see them. */
export const squadParts = {
  fr: { money: ", cotisation", care: ", consignes de soin" },
  nl: { money: ", lidgeld", care: ", zorginstructies" },
  en: { money: ", fee", care: ", care instructions" },
} as const;
