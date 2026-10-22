/** A2: « Subsides & sponsors », one page in two views. */
type Copy = {
  title: string;
  intro: string;
  views: string;
  grants: string;
  sponsoring: string;
  season: string;
  allSeasons: string;
  colGrant: string;
  colPeriod: string;
  colOpens: string;
  colDeadline: string;
  colCall: string;
  colContact: string;
  colFiled: string;
  colRequested: string;
  colReceived: string;
  colPrevious: string;
  colTasks: string;
  yes: string;
  no: string;
  seeCall: string;
  seeCallOf: string;
  previous: string;
  previousOf: string;
  tasks: string;
  tasksOf: string;
  period: string;
  opensOn: string;
  startsOn: string;
  totalRequested: string;
  totalGranted: string;
  totalReceived: string;
  totalSigned: string;
  totalCollected: string;
  payments: string;
  paymentsIntro: string;
  paymentDate: string;
  paymentAmount: string;
  paymentNote: string;
  addPayment: string;
  removePayment: string;
  noPayment: string;
  paymentsTotal: string;
  paymentsOnlyGranted: string;
  colName: string;
  colPackage: string;
  colAmount: string;
  colStatus: string;
  colLastContact: string;
  colResponsible: string;
  colNextAction: string;
  responsible: string;
  nobody: string;
  lastContact: string;
  contacted: string;
  contactedOf: string;
  quiet: string;
};

export const grantsSponsorsCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    title: "Subsides & sponsors",
    intro: "Ce qui ouvre, ce qui ferme et qui relancer : les subsides et le sponsoring du club au même endroit.",
    views: "Vues de la page",
    grants: "Subsides",
    sponsoring: "Sponsoring",
    season: "Saison",
    allSeasons: "Toutes les saisons",
    colGrant: "Subside et organisme",
    colPeriod: "Période couverte",
    colOpens: "Ouverture de l'appel",
    colDeadline: "Échéance de dépôt",
    colCall: "Appel",
    colContact: "Contact",
    colFiled: "Déjà introduit",
    colRequested: "Demandé",
    colReceived: "Reçu",
    colPrevious: "Année précédente",
    colTasks: "Tâches",
    yes: "Oui",
    no: "Non",
    seeCall: "Voir l'appel",
    seeCallOf: "Voir l'appel : {grant}",
    previous: "Dossier précédent",
    previousOf: "Dossier précédent de {grant}",
    tasks: "Tâches ({n})",
    tasksOf: "Tâches de {about} ({n})",
    period: "{from} au {to}",
    opensOn: "Ouverture de l'appel",
    startsOn: "Début de la période couverte",
    totalRequested: "Demandé",
    totalGranted: "Accordé",
    totalReceived: "Reçu",
    totalSigned: "Sponsoring signé",
    totalCollected: "Encaissé",
    payments: "Montants reçus",
    paymentsIntro: "Une ligne par tranche : un subside versé en deux fois reste un seul financement.",
    paymentDate: "Reçu le",
    paymentAmount: "Montant (€)",
    paymentNote: "Note",
    addPayment: "Ajouter la tranche",
    removePayment: "Supprimer la tranche du {date}",
    noPayment: "Rien de reçu pour l'instant.",
    paymentsTotal: "Total reçu : {total}",
    paymentsOnlyGranted: "Les tranches s'ajoutent une fois le subside accordé.",
    colName: "Sponsor",
    colPackage: "Pack",
    colAmount: "Montant",
    colStatus: "Statut",
    colLastContact: "Dernier contact",
    colResponsible: "Responsable",
    colNextAction: "Prochaine action",
    responsible: "Responsable au club",
    nobody: "Personne",
    lastContact: "Dernier contact",
    contacted: "Contact pris aujourd'hui",
    contactedOf: "Contact pris aujourd'hui avec {name}",
    quiet: "Sans contact depuis 90 jours",
  },
  nl: {
    title: "Subsidies & sponsors",
    intro: "Wat opent, wat sluit en wie op te volgen: de subsidies en de sponsoring van de club op één plek.",
    views: "Weergaven van de pagina",
    grants: "Subsidies",
    sponsoring: "Sponsoring",
    season: "Seizoen",
    allSeasons: "Alle seizoenen",
    colGrant: "Subsidie en organisatie",
    colPeriod: "Gedekte periode",
    colOpens: "Opening van de oproep",
    colDeadline: "Indieningsdatum",
    colCall: "Oproep",
    colContact: "Contact",
    colFiled: "Al ingediend",
    colRequested: "Gevraagd",
    colReceived: "Ontvangen",
    colPrevious: "Vorig jaar",
    colTasks: "Taken",
    yes: "Ja",
    no: "Nee",
    seeCall: "De oproep bekijken",
    seeCallOf: "De oproep bekijken: {grant}",
    previous: "Vorig dossier",
    previousOf: "Vorig dossier van {grant}",
    tasks: "Taken ({n})",
    tasksOf: "Taken van {about} ({n})",
    period: "{from} tot {to}",
    opensOn: "Opening van de oproep",
    startsOn: "Begin van de gedekte periode",
    totalRequested: "Gevraagd",
    totalGranted: "Toegekend",
    totalReceived: "Ontvangen",
    totalSigned: "Ondertekende sponsoring",
    totalCollected: "Geïnd",
    payments: "Ontvangen bedragen",
    paymentsIntro: "Eén regel per schijf: een subsidie in twee keer betaald blijft één financiering.",
    paymentDate: "Ontvangen op",
    paymentAmount: "Bedrag (€)",
    paymentNote: "Notitie",
    addPayment: "De schijf toevoegen",
    removePayment: "De schijf van {date} verwijderen",
    noPayment: "Nog niets ontvangen.",
    paymentsTotal: "Totaal ontvangen: {total}",
    paymentsOnlyGranted: "Schijven worden toegevoegd zodra de subsidie toegekend is.",
    colName: "Sponsor",
    colPackage: "Pakket",
    colAmount: "Bedrag",
    colStatus: "Status",
    colLastContact: "Laatste contact",
    colResponsible: "Verantwoordelijke",
    colNextAction: "Volgende stap",
    responsible: "Verantwoordelijke in de club",
    nobody: "Niemand",
    lastContact: "Laatste contact",
    contacted: "Vandaag contact gehad",
    contactedOf: "Vandaag contact gehad met {name}",
    quiet: "Geen contact sinds 90 dagen",
  },
  en: {
    title: "Grants & sponsors",
    intro: "What opens, what closes and whom to follow up: the club's grants and sponsorship in one place.",
    views: "Views of the page",
    grants: "Grants",
    sponsoring: "Sponsorship",
    season: "Season",
    allSeasons: "All seasons",
    colGrant: "Grant and funder",
    colPeriod: "Period covered",
    colOpens: "Call opens",
    colDeadline: "Filing deadline",
    colCall: "Call",
    colContact: "Contact",
    colFiled: "Already filed",
    colRequested: "Requested",
    colReceived: "Received",
    colPrevious: "Previous year",
    colTasks: "Tasks",
    yes: "Yes",
    no: "No",
    seeCall: "See the call",
    seeCallOf: "See the call: {grant}",
    previous: "Previous file",
    previousOf: "Previous file of {grant}",
    tasks: "Tasks ({n})",
    tasksOf: "Tasks of {about} ({n})",
    period: "{from} to {to}",
    opensOn: "Call opens",
    startsOn: "Start of the period covered",
    totalRequested: "Requested",
    totalGranted: "Granted",
    totalReceived: "Received",
    totalSigned: "Sponsorship signed",
    totalCollected: "Collected",
    payments: "Amounts received",
    paymentsIntro: "One line per instalment: a grant paid in two parts stays one funding.",
    paymentDate: "Received on",
    paymentAmount: "Amount (€)",
    paymentNote: "Note",
    addPayment: "Add the instalment",
    removePayment: "Delete the instalment of {date}",
    noPayment: "Nothing received yet.",
    paymentsTotal: "Total received: {total}",
    paymentsOnlyGranted: "Instalments are added once the grant is awarded.",
    colName: "Sponsor",
    colPackage: "Package",
    colAmount: "Amount",
    colStatus: "Status",
    colLastContact: "Last contact",
    colResponsible: "Person in charge",
    colNextAction: "Next step",
    responsible: "Person in charge at the club",
    nobody: "Nobody",
    lastContact: "Last contact",
    contacted: "Contacted today",
    contactedOf: "Contacted {name} today",
    quiet: "No contact for 90 days",
  },
};
