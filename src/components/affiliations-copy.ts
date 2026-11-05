/** Wave 17 (N2): affiliations and federal fees, for the club and for the federation. */
type Copy = {
  title: string;
  intro: string;
  fedIntro: string;
  loading: string;
  add: string;
  addFed: string;
  current: string;
  definitions: string;
  name: string;
  owner: string;
  federation: string;
  club: string;
  contact: string;
  noContact: string;
  basis: string;
  perPlayer: string;
  perClub: string;
  perPlayerCount: string;
  frequency: string;
  annual: string;
  monthly: string;
  amount: string;
  amountHint: string;
  period: string;
  deadline: string;
  status: string;
  states: { open: string; late: string; paid: string };
  paidOn: string;
  markPaid: string;
  markPaidOf: string;
  markTitle: string;
  createExpense: string;
  createExpenseHint: string;
  method: string;
  methods: { transfer: string; cash: string; card: string; other: string };
  confirm: string;
  cancel: string;
  marked: string;
  none: string;
  noDues: string;
  description: string;
  opens: string;
  opensHint: string;
  month: string;
  day: string;
  dueMode: string;
  dueAfter: string;
  dueFixed: string;
  days: string;
  scope: string;
  allClubs: string;
  chosenClubs: string;
  clubsCount: string;
  save: string;
  archive: string;
  archiveOf: string;
  amountOf: string;
  amountSave: string;
  amountSaved: string;
  overCap: string;
  archived: string;
  saved: string;
  examples: string;
  example: string;
  tracking: string;
  remind: string;
  reminded: string;
  nothingLate: string;
  statusLink: string;
  months: string[];
};

const months = {
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  nl: ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

export const affiliationsCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    title: "Affiliations",
    intro: "Les affiliations et cotisations que le club paie (fédération, assurance…), avec leurs dates. « Marquer en ordre » coche aussi la ligne dans « Statut du club ».",
    fedIntro: "Les affiliations que vos clubs paient à la fédération, et qui est en ordre. Chaque club ne voit que ses propres montants.",
    loading: "Chargement des affiliations…",
    add: "Ajouter une affiliation du club",
    addFed: "Nouvelle affiliation",
    current: "À payer et payées",
    definitions: "Définitions",
    name: "Nom",
    owner: "Définie par",
    federation: "Fédération",
    club: "Club",
    contact: "Personne de contact",
    noContact: "Aucune",
    basis: "Base de calcul",
    perPlayer: "Par joueur licencié",
    perClub: "Par club",
    perPlayerCount: "{n} joueurs × {amount}",
    frequency: "Fréquence",
    annual: "Annuelle",
    monthly: "Mensuelle",
    amount: "Montant (€)",
    amountHint: "Par joueur ou pour le club, selon la base de calcul.",
    period: "Période",
    deadline: "Date limite",
    status: "Statut",
    states: { open: "À payer", late: "En retard", paid: "En ordre" },
    paidOn: "Payée le",
    markPaid: "Marquer en ordre",
    markPaidOf: "Marquer en ordre : {name}",
    markTitle: "{name} en ordre",
    createExpense: "Créer la dépense dans le grand livre",
    createExpenseHint: "Une dépense « Affiliations » du montant, à la date du paiement.",
    method: "Moyen de paiement",
    methods: { transfer: "Virement", cash: "Espèces", card: "Carte", other: "Autre" },
    confirm: "Marquer en ordre",
    cancel: "Annuler",
    marked: "Affiliation en ordre",
    none: "Aucune affiliation pour l'instant.",
    noDues: "Rien à payer pour l'instant : chaque affiliation apparaît ici à sa date d'ouverture.",
    description: "Description (facultative)",
    opens: "Ouverture",
    opensHint: "Le jour où la période commence et où la somme devient due (par exemple le 1er août).",
    month: "Mois",
    day: "Jour",
    dueMode: "Date limite",
    dueAfter: "Un délai après l'ouverture",
    dueFixed: "Une date fixe",
    days: "Nombre de jours",
    scope: "Pour quels clubs ?",
    allClubs: "Tous les clubs de la fédération",
    chosenClubs: "Les clubs choisis",
    clubsCount: "{n} clubs",
    save: "Enregistrer",
    archive: "Archiver",
    archiveOf: "Archiver {name}",
    amountOf: "Montant de {name} en euros",
    amountSave: "Changer le montant",
    amountSaved: "Montant changé : les prochaines échéances le prennent.",
    overCap: "Au-delà du plafond BPCF de 80 € par joueur",
    archived: "Affiliation archivée",
    saved: "Affiliation enregistrée",
    examples: "Exemples à compléter",
    example: "Partir de « {name} »",
    tracking: "Suivi par club",
    remind: "Relancer les clubs en retard",
    reminded: "{n} clubs relancés",
    nothingLate: "Aucun club en retard.",
    statusLink: "Voir le statut du club",
    months: months.fr,
  },
  nl: {
    title: "Aansluitingen",
    intro: "De aansluitingen en bijdragen die de club betaalt (federatie, verzekering…), met hun data. « Als in orde markeren » vinkt ook de regel in « Status van de club » aan.",
    fedIntro: "De aansluitingen die uw clubs aan de federatie betalen, en wie in orde is. Elke club ziet enkel zijn eigen bedragen.",
    loading: "Aansluitingen laden…",
    add: "Een aansluiting van de club toevoegen",
    addFed: "Nieuwe aansluiting",
    current: "Te betalen en betaald",
    definitions: "Definities",
    name: "Naam",
    owner: "Bepaald door",
    federation: "Federatie",
    club: "Club",
    contact: "Contactpersoon",
    noContact: "Geen",
    basis: "Berekeningsbasis",
    perPlayer: "Per aangesloten speler",
    perClub: "Per club",
    perPlayerCount: "{n} spelers × {amount}",
    frequency: "Frequentie",
    annual: "Jaarlijks",
    monthly: "Maandelijks",
    amount: "Bedrag (€)",
    amountHint: "Per speler of voor de club, volgens de berekeningsbasis.",
    period: "Periode",
    deadline: "Uiterste datum",
    status: "Status",
    states: { open: "Te betalen", late: "Te laat", paid: "In orde" },
    paidOn: "Betaald op",
    markPaid: "Als in orde markeren",
    markPaidOf: "Als in orde markeren: {name}",
    markTitle: "{name} in orde",
    createExpense: "De uitgave in het grootboek aanmaken",
    createExpenseHint: "Een uitgave « Aansluitingen » van het bedrag, op de betaaldatum.",
    method: "Betaalwijze",
    methods: { transfer: "Overschrijving", cash: "Contant", card: "Kaart", other: "Andere" },
    confirm: "Als in orde markeren",
    cancel: "Annuleren",
    marked: "Aansluiting in orde",
    none: "Nog geen aansluiting.",
    noDues: "Voorlopig niets te betalen: elke aansluiting verschijnt hier op haar openingsdatum.",
    description: "Beschrijving (optioneel)",
    opens: "Opening",
    opensHint: "De dag waarop de periode begint en het bedrag verschuldigd wordt (bijvoorbeeld 1 augustus).",
    month: "Maand",
    day: "Dag",
    dueMode: "Uiterste datum",
    dueAfter: "Een termijn na de opening",
    dueFixed: "Een vaste datum",
    days: "Aantal dagen",
    scope: "Voor welke clubs?",
    allClubs: "Alle clubs van de federatie",
    chosenClubs: "De gekozen clubs",
    clubsCount: "{n} clubs",
    save: "Opslaan",
    archive: "Archiveren",
    archiveOf: "{name} archiveren",
    amountOf: "Bedrag van {name} in euro",
    amountSave: "Bedrag wijzigen",
    amountSaved: "Bedrag gewijzigd: de volgende vervaldagen nemen het over.",
    overCap: "Boven het BPCF-plafond van 80 € per speler",
    archived: "Aansluiting gearchiveerd",
    saved: "Aansluiting opgeslagen",
    examples: "Voorbeelden om aan te vullen",
    example: "Vertrekken van « {name} »",
    tracking: "Opvolging per club",
    remind: "De clubs die te laat zijn herinneren",
    reminded: "{n} clubs herinnerd",
    nothingLate: "Geen enkele club te laat.",
    statusLink: "De status van de club bekijken",
    months: months.nl,
  },
  en: {
    title: "Affiliations",
    intro: "The affiliations and fees the club pays (federation, insurance…), with their dates. « Mark as settled » also ticks the line in « Club status ».",
    fedIntro: "The affiliations your clubs pay to the federation, and who is settled. Each club only sees its own amounts.",
    loading: "Loading the affiliations…",
    add: "Add an affiliation of the club",
    addFed: "New affiliation",
    current: "To pay and paid",
    definitions: "Definitions",
    name: "Name",
    owner: "Defined by",
    federation: "Federation",
    club: "Club",
    contact: "Contact person",
    noContact: "None",
    basis: "Calculation basis",
    perPlayer: "Per licensed player",
    perClub: "Per club",
    perPlayerCount: "{n} players × {amount}",
    frequency: "Frequency",
    annual: "Yearly",
    monthly: "Monthly",
    amount: "Amount (€)",
    amountHint: "Per player or for the club, depending on the basis.",
    period: "Period",
    deadline: "Deadline",
    status: "Status",
    states: { open: "To pay", late: "Late", paid: "Settled" },
    paidOn: "Paid on",
    markPaid: "Mark as settled",
    markPaidOf: "Mark as settled: {name}",
    markTitle: "{name} settled",
    createExpense: "Create the expense in the ledger",
    createExpenseHint: "An « Affiliations » expense of the amount, on the payment day.",
    method: "Payment method",
    methods: { transfer: "Transfer", cash: "Cash", card: "Card", other: "Other" },
    confirm: "Mark as settled",
    cancel: "Cancel",
    marked: "Affiliation settled",
    none: "No affiliation yet.",
    noDues: "Nothing to pay for now: each affiliation shows here on its opening day.",
    description: "Description (optional)",
    opens: "Opening",
    opensHint: "The day the period starts and the amount becomes due (for example 1 August).",
    month: "Month",
    day: "Day",
    dueMode: "Deadline",
    dueAfter: "A delay after the opening",
    dueFixed: "A fixed date",
    days: "Number of days",
    scope: "For which clubs?",
    allClubs: "All the federation's clubs",
    chosenClubs: "The chosen clubs",
    clubsCount: "{n} clubs",
    save: "Save",
    archive: "Archive",
    archiveOf: "Archive {name}",
    amountOf: "Amount of {name} in euros",
    amountSave: "Change the amount",
    amountSaved: "Amount changed: the next dues take it.",
    overCap: "Above the BPCF cap of 80 € per player",
    archived: "Affiliation archived",
    saved: "Affiliation saved",
    examples: "Examples to complete",
    example: "Start from « {name} »",
    tracking: "Follow-up per club",
    remind: "Remind the clubs that are late",
    reminded: "{n} clubs reminded",
    nothingLate: "No club is late.",
    statusLink: "See the club status",
    months: months.en,
  },
};

export const put = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
