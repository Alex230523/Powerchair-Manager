import type { DepartureStatus } from "@/domains/people/schema";

/** Wave 17 (J1): the single sheet in a window, the current situation of former members, the departure window. */
type Copy = {
  view: string;
  viewOf: string;
  expand: string;
  expandOf: string;
  close: string;
  situation: string;
  playsAt: string;
  playsAtTeam: string;
  otherTeam: string;
  statuses: Record<DepartureStatus, string>;
  inMemoriam: string;
  departureTitle: string;
  departureFor: string;
  reason: string;
  note: string;
  noteHint: string;
  deceasedHint: string;
  confirmDeceased: string;
  liftDeceased: string;
  presidentOnly: string;
  saveDeparture: string;
  editSituation: string;
  editSituationOf: string;
  cancel: string;
  identityEdit: string;
  teamCard: string;
  positionEdit: string;
  assignTitle: string;
  assign: string;
  startsOn: string;
  noOpenTeam: string;
};

export const sheetCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    view: "Voir",
    viewOf: "Voir la fiche de {name}",
    expand: "Agrandir",
    expandOf: "Agrandir la fiche de {name} en pleine page",
    close: "Fermer",
    situation: "Situation actuelle",
    playsAt: "Joue à {club}",
    playsAtTeam: "Joue à {club}, {team}",
    otherTeam: "Dans une autre équipe du club : {teams}",
    statuses: { stopped: "A arrêté de jouer", moved: "A déménagé", unknown: "Inconnu", deceased: "Décédé" },
    inMemoriam: "In memoriam",
    departureTitle: "Départ de {name}",
    departureFor: "Pourquoi {name} quitte-t-il ou quitte-t-elle le club ?",
    reason: "Raison du départ",
    note: "Note (facultative)",
    noteHint: "Visible des responsables du club seulement.",
    deceasedHint:
      "La fiche est archivée avec la mention « In memoriam ». Plus aucune notification, relance, cotisation ni email ne sera envoyé à cette personne ni à son sujet.",
    confirmDeceased: "Je confirme le décès de {name}",
    liftDeceased: "Je confirme retirer la mention « Décédé » de {name}",
    presidentOnly: "Seul le président du club peut poser ou retirer ce statut.",
    saveDeparture: "Enregistrer le départ",
    editSituation: "Modifier la situation",
    editSituationOf: "Modifier la situation de {name}",
    cancel: "Annuler",
    identityEdit: "Identité",
    teamCard: "Équipe et poste",
    positionEdit: "Poste et numéro",
    assignTitle: "Affecter à une équipe",
    assign: "Affecter",
    startsOn: "À partir du",
    noOpenTeam: "Aucune équipe ouverte pour l'instant.",
  },
  nl: {
    view: "Bekijken",
    viewOf: "De fiche van {name} bekijken",
    expand: "Vergroten",
    expandOf: "De fiche van {name} op een volledige pagina tonen",
    close: "Sluiten",
    situation: "Huidige situatie",
    playsAt: "Speelt bij {club}",
    playsAtTeam: "Speelt bij {club}, {team}",
    otherTeam: "In een ander team van de club: {teams}",
    statuses: { stopped: "Gestopt met spelen", moved: "Verhuisd", unknown: "Onbekend", deceased: "Overleden" },
    inMemoriam: "In memoriam",
    departureTitle: "Vertrek van {name}",
    departureFor: "Waarom verlaat {name} de club?",
    reason: "Reden van vertrek",
    note: "Notitie (optioneel)",
    noteHint: "Alleen zichtbaar voor de verantwoordelijken van de club.",
    deceasedHint:
      "De fiche wordt gearchiveerd met de vermelding « In memoriam ». Er wordt geen melding, herinnering, lidgeld of e-mail meer verstuurd aan of over deze persoon.",
    confirmDeceased: "Ik bevestig het overlijden van {name}",
    liftDeceased: "Ik bevestig dat ik de vermelding « Overleden » bij {name} weghaal",
    presidentOnly: "Alleen de voorzitter van de club kan deze status zetten of weghalen.",
    saveDeparture: "Vertrek opslaan",
    editSituation: "Situatie wijzigen",
    editSituationOf: "De situatie van {name} wijzigen",
    cancel: "Annuleren",
    identityEdit: "Identiteit",
    teamCard: "Team en positie",
    positionEdit: "Positie en nummer",
    assignTitle: "Aan een team toewijzen",
    assign: "Toewijzen",
    startsOn: "Vanaf",
    noOpenTeam: "Voorlopig geen open team.",
  },
  en: {
    view: "View",
    viewOf: "View the sheet of {name}",
    expand: "Expand",
    expandOf: "Open the sheet of {name} as a full page",
    close: "Close",
    situation: "Current situation",
    playsAt: "Plays at {club}",
    playsAtTeam: "Plays at {club}, {team}",
    otherTeam: "In another team of the club: {teams}",
    statuses: { stopped: "Stopped playing", moved: "Moved away", unknown: "Unknown", deceased: "Deceased" },
    inMemoriam: "In memoriam",
    departureTitle: "Departure of {name}",
    departureFor: "Why does {name} leave the club?",
    reason: "Reason for leaving",
    note: "Note (optional)",
    noteHint: "Only seen by the club's managers.",
    deceasedHint:
      "The sheet is archived with the mention « In memoriam ». No notification, reminder, fee or email will be sent to this person or about them any more.",
    confirmDeceased: "I confirm the death of {name}",
    liftDeceased: "I confirm removing the mention « Deceased » from {name}",
    presidentOnly: "Only the club president can set or remove this status.",
    saveDeparture: "Save the departure",
    editSituation: "Change the situation",
    editSituationOf: "Change the situation of {name}",
    cancel: "Cancel",
    identityEdit: "Identity",
    teamCard: "Team and position",
    positionEdit: "Position and number",
    assignTitle: "Assign to a team",
    assign: "Assign",
    startsOn: "From",
    noOpenTeam: "No open team for now.",
  },
};

export const fillIn = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
