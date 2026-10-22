/** Wave 17 (Q1): equipment tabs, chair sheet, models, storage places and loans. */
type Copy = {
  tabsLabel: string;
  tabs: Record<"chairs" | "small" | "lending" | "places" | "models", string>;
  fleetIntro: string;
  addChair: string;
  cols: Record<"name" | "model" | "acquired" | "status" | "players" | "place" | "nextService" | "loan", string>;
  model: string;
  allModels: string;
  place: string;
  allPlaces: string;
  modelStatus: Record<"validated" | "proposed" | "refused", string>;
  noModel: string;
  sheetTabs: Record<"facts" | "edit" | "lend" | "service" | "history", string>;
  expand: string;
  expandOf: string;
  close: string;
  back: string;
  notFound: string;
  chooseModel: string;
  proposeModel: string;
  newBrand: string;
  newName: string;
  proposeHint: string;
  acquired: string;
  noPlace: string;
  lendable: string;
  lendableHint: string;
  required: string;
  toPlayer: string;
  toClub: string;
  borrower: string;
  starts: string;
  ends: string;
  conditions: string;
  deposit: string;
  lendButton: string;
  noPartner: string;
  serviceDone: string;
  serviceNext: string;
  serviceNote: string;
  markService: string;
  history: Record<string, string>;
  noHistory: string;
  lentTo: string;
  lentBy: string;
  reservedFor: string;
  borrowedTitle: string;
  borrowedIntro: string;
  available: string;
  availableIntro: string;
  owner: string;
  availability: string;
  free: string;
  busyRange: string;
  ask: string;
  askOf: string;
  message: string;
  sendRequest: string;
  noAvailable: string;
  lent: string;
  borrowed: string;
  noLoan: string;
  loanCols: Record<"chair" | "club" | "dates" | "status" | "details", string>;
  loanStatus: Record<"requested" | "accepted" | "ongoing" | "returned" | "refused" | "cancelled", string>;
  accept: string;
  refuse: string;
  decisionNote: string;
  handOver: string;
  conditionOut: string;
  conditionIn: string;
  markReturned: string;
  cancelLoan: string;
  fromTo: string;
  depositOf: string;
  addPlace: string;
  placeName: string;
  clubPlace: string;
  noClubPlace: string;
  address: string;
  contact: string;
  access: string;
  notes: string;
  archivedPlace: string;
  save: string;
  cancel: string;
  edit: string;
  editOf: string;
  storedAt: string;
  noStored: string;
  noPlaces: string;
  chairsLabel: string;
  itemsLabel: string;
  models: string;
  modelsIntro: string;
  brand: string;
  name: string;
  proposedBy: string;
  shared: string;
  validate: string;
  refuseModel: string;
  chairsCount: string;
  noModels: string;
  saved: string;
  errors: Record<string, string>;
};

export const fleetCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    tabsLabel: "Sections du matériel",
    tabs: { chairs: "Fauteuils", small: "Petit matériel", lending: "Prêts entre clubs", places: "Lieux de stockage", models: "Modèles de fauteuils" },
    fleetIntro: "La flotte de la fédération : ses fauteuils, prêtés aux clubs avec les mêmes écrans.",
    addChair: "Ajouter un fauteuil",
    cols: { name: "Fauteuil", model: "Modèle", acquired: "Date d'achat", status: "État", players: "Joueurs", place: "Lieu de stockage", nextService: "Prochaine révision", loan: "Prêt" },
    model: "Modèle",
    allModels: "Tous les modèles",
    place: "Lieu",
    allPlaces: "Tous les lieux",
    modelStatus: { validated: "Validé", proposed: "En attente de validation", refused: "Refusé" },
    noModel: "Modèle à renseigner",
    sheetTabs: { facts: "Fiche", edit: "Modifier", lend: "Prêter", service: "Entretien", history: "Historique" },
    expand: "Agrandir",
    expandOf: "Agrandir la fiche de {name} en pleine page",
    close: "Fermer",
    back: "Retour au matériel",
    notFound: "Ce fauteuil n'existe pas ou n'est pas visible avec ce profil.",
    chooseModel: "Choisir un modèle",
    proposeModel: "Proposer un nouveau modèle…",
    newBrand: "Marque du nouveau modèle",
    newName: "Nom du nouveau modèle",
    proposeHint: "Le modèle est proposé à la fédération ; le fauteuil l'affiche « En attente de validation » jusqu'à sa décision.",
    acquired: "Date d'achat",
    noPlace: "Aucun lieu",
    lendable: "Prêtable",
    lendableHint: "Visible des autres clubs de la fédération, qui peuvent demander un prêt.",
    required: "obligatoire",
    toPlayer: "À un joueur du club",
    toClub: "À un autre club",
    borrower: "Club emprunteur",
    starts: "Du",
    ends: "Au",
    conditions: "Conditions",
    deposit: "Caution en euros (facultative)",
    lendButton: "Prêter le fauteuil",
    noPartner: "Aucun autre club dans la fédération.",
    serviceDone: "Révision faite le",
    serviceNext: "Prochaine révision",
    serviceNote: "Ce qui a été fait",
    markService: "Noter la révision",
    history: {
      create: "Création",
      update: "Modification",
      assign: "Attribué à un joueur",
      unassign: "Fin d'attribution",
      service: "Révision",
      "loan.lend": "Prêté",
      "loan.request": "Prêt demandé",
      "loan.accept": "Prêt accepté",
      "loan.refuse": "Prêt refusé",
      "loan.cancel": "Prêt annulé",
      "loan.handOver": "Remis à l'emprunteur",
      "loan.return": "Rendu",
    },
    noHistory: "Aucun événement.",
    lentTo: "Prêté à {club} jusqu'au {date}",
    lentBy: "Prêté par {club} jusqu'au {date}",
    reservedFor: "Réservé pour {club} du {from} au {to}",
    borrowedTitle: "Fauteuils empruntés",
    borrowedIntro: "Les fauteuils qu'un autre club ou la fédération vous prête.",
    available: "Fauteuils disponibles au prêt",
    availableIntro: "Les fauteuils que les clubs et la fédération ont marqués « Prêtable ».",
    owner: "Propriétaire",
    availability: "Disponibilités",
    free: "Libre",
    busyRange: "Prêté du {from} au {to}",
    ask: "Demander un prêt",
    askOf: "Demander un prêt : {name}",
    message: "Message (facultatif)",
    sendRequest: "Envoyer la demande",
    noAvailable: "Aucun fauteuil n'est proposé au prêt pour le moment.",
    lent: "Mes prêts et demandes reçues",
    borrowed: "Mes emprunts et demandes envoyées",
    noLoan: "Aucun prêt.",
    loanCols: { chair: "Fauteuil", club: "Club", dates: "Dates", status: "Statut", details: "Suivi" },
    loanStatus: { requested: "Demandé", accepted: "Accepté", ongoing: "En cours", returned: "Rendu", refused: "Refusé", cancelled: "Annulé" },
    accept: "Accepter",
    refuse: "Refuser",
    decisionNote: "Réponse (facultative)",
    handOver: "Remettre le fauteuil",
    conditionOut: "État au départ",
    conditionIn: "État au retour",
    markReturned: "Noter le retour",
    cancelLoan: "Annuler",
    fromTo: "du {from} au {to}",
    depositOf: "Caution : {amount}",
    addPlace: "Ajouter un lieu",
    placeName: "Nom du lieu",
    clubPlace: "Lieu du club",
    noClubPlace: "Aucun",
    address: "Adresse",
    contact: "Contact",
    access: "Accès (clés, horaires)",
    notes: "Remarques",
    archivedPlace: "Lieu plus utilisé",
    save: "Enregistrer",
    cancel: "Annuler",
    edit: "Modifier",
    editOf: "Modifier : {name}",
    storedAt: "Ce qui est stocké à {name}",
    noStored: "Rien n'y est rangé.",
    noPlaces: "Aucun lieu de stockage pour le moment.",
    chairsLabel: "Fauteuils",
    itemsLabel: "Petit matériel",
    models: "Modèles de fauteuils",
    modelsIntro: "Les modèles proposés par vos clubs attendent votre décision ; un modèle validé rejoint la liste de tous vos clubs.",
    brand: "Marque",
    name: "Nom",
    proposedBy: "Proposé par {club}",
    shared: "Liste commune",
    validate: "Valider",
    refuseModel: "Refuser",
    chairsCount: "{n} fauteuil(s)",
    noModels: "Aucun modèle.",
    saved: "Enregistré.",
    errors: {
      MODEL_REQUIRED: "Choisissez un modèle ou proposez-en un.",
      ACQUIRED_REQUIRED: "La date d'achat est obligatoire.",
      LOAN_DATES: "Vérifiez les dates : la fin après le début, et rien dans le passé.",
      LOAN_OVERLAP: "Ce fauteuil est déjà prêté sur ces dates.",
      NO_FEDERATION: "Les prêts se font entre clubs d'une même fédération.",
      NOT_FOUND: "Introuvable, ou plus disponible.",
    },
  },
  nl: {
    tabsLabel: "Onderdelen van het materiaal",
    tabs: { chairs: "Rolstoelen", small: "Klein materiaal", lending: "Uitlenen tussen clubs", places: "Opslagplaatsen", models: "Rolstoelmodellen" },
    fleetIntro: "De vloot van de federatie: haar rolstoelen, uitgeleend aan de clubs met dezelfde schermen.",
    addChair: "Rolstoel toevoegen",
    cols: { name: "Rolstoel", model: "Model", acquired: "Aankoopdatum", status: "Staat", players: "Spelers", place: "Opslagplaats", nextService: "Volgend onderhoud", loan: "Uitlening" },
    model: "Model",
    allModels: "Alle modellen",
    place: "Plaats",
    allPlaces: "Alle plaatsen",
    modelStatus: { validated: "Gevalideerd", proposed: "Wacht op validatie", refused: "Geweigerd" },
    noModel: "Model in te vullen",
    sheetTabs: { facts: "Fiche", edit: "Wijzigen", lend: "Uitlenen", service: "Onderhoud", history: "Geschiedenis" },
    expand: "Vergroten",
    expandOf: "De fiche van {name} vergroten tot een volledige pagina",
    close: "Sluiten",
    back: "Terug naar het materiaal",
    notFound: "Deze rolstoel bestaat niet of is niet zichtbaar met dit profiel.",
    chooseModel: "Kies een model",
    proposeModel: "Een nieuw model voorstellen…",
    newBrand: "Merk van het nieuwe model",
    newName: "Naam van het nieuwe model",
    proposeHint: "Het model wordt aan de federatie voorgesteld; de rolstoel toont « Wacht op validatie » tot haar beslissing.",
    acquired: "Aankoopdatum",
    noPlace: "Geen plaats",
    lendable: "Uitleenbaar",
    lendableHint: "Zichtbaar voor de andere clubs van de federatie, die een uitlening kunnen vragen.",
    required: "verplicht",
    toPlayer: "Aan een speler van de club",
    toClub: "Aan een andere club",
    borrower: "Ontlenende club",
    starts: "Van",
    ends: "Tot",
    conditions: "Voorwaarden",
    deposit: "Waarborg in euro (optioneel)",
    lendButton: "Rolstoel uitlenen",
    noPartner: "Geen andere club in de federatie.",
    serviceDone: "Onderhoud gedaan op",
    serviceNext: "Volgend onderhoud",
    serviceNote: "Wat er gedaan werd",
    markService: "Onderhoud noteren",
    history: {
      create: "Aangemaakt",
      update: "Gewijzigd",
      assign: "Toegewezen aan een speler",
      unassign: "Einde toewijzing",
      service: "Onderhoud",
      "loan.lend": "Uitgeleend",
      "loan.request": "Uitlening gevraagd",
      "loan.accept": "Uitlening aanvaard",
      "loan.refuse": "Uitlening geweigerd",
      "loan.cancel": "Uitlening geannuleerd",
      "loan.handOver": "Overhandigd aan de ontlener",
      "loan.return": "Teruggebracht",
    },
    noHistory: "Geen gebeurtenis.",
    lentTo: "Uitgeleend aan {club} tot {date}",
    lentBy: "Uitgeleend door {club} tot {date}",
    reservedFor: "Gereserveerd voor {club} van {from} tot {to}",
    borrowedTitle: "Ontleende rolstoelen",
    borrowedIntro: "De rolstoelen die een andere club of de federatie u uitleent.",
    available: "Rolstoelen beschikbaar voor uitlening",
    availableIntro: "De rolstoelen die de clubs en de federatie « Uitleenbaar » maakten.",
    owner: "Eigenaar",
    availability: "Beschikbaarheid",
    free: "Vrij",
    busyRange: "Uitgeleend van {from} tot {to}",
    ask: "Uitlening vragen",
    askOf: "Uitlening vragen: {name}",
    message: "Bericht (optioneel)",
    sendRequest: "Aanvraag versturen",
    noAvailable: "Momenteel wordt geen rolstoel ter uitlening aangeboden.",
    lent: "Mijn uitleningen en ontvangen aanvragen",
    borrowed: "Mijn ontleningen en verstuurde aanvragen",
    noLoan: "Geen uitlening.",
    loanCols: { chair: "Rolstoel", club: "Club", dates: "Data", status: "Status", details: "Opvolging" },
    loanStatus: { requested: "Gevraagd", accepted: "Aanvaard", ongoing: "Lopend", returned: "Teruggebracht", refused: "Geweigerd", cancelled: "Geannuleerd" },
    accept: "Aanvaarden",
    refuse: "Weigeren",
    decisionNote: "Antwoord (optioneel)",
    handOver: "Rolstoel overhandigen",
    conditionOut: "Staat bij vertrek",
    conditionIn: "Staat bij terugkeer",
    markReturned: "Terugkeer noteren",
    cancelLoan: "Annuleren",
    fromTo: "van {from} tot {to}",
    depositOf: "Waarborg: {amount}",
    addPlace: "Plaats toevoegen",
    placeName: "Naam van de plaats",
    clubPlace: "Plaats van de club",
    noClubPlace: "Geen",
    address: "Adres",
    contact: "Contact",
    access: "Toegang (sleutels, uren)",
    notes: "Opmerkingen",
    archivedPlace: "Plaats niet meer in gebruik",
    save: "Opslaan",
    cancel: "Annuleren",
    edit: "Wijzigen",
    editOf: "Wijzigen: {name}",
    storedAt: "Wat er opgeslagen is in {name}",
    noStored: "Er ligt niets.",
    noPlaces: "Nog geen opslagplaats.",
    chairsLabel: "Rolstoelen",
    itemsLabel: "Klein materiaal",
    models: "Rolstoelmodellen",
    modelsIntro: "De modellen die uw clubs voorstellen wachten op uw beslissing; een gevalideerd model komt in de lijst van al uw clubs.",
    brand: "Merk",
    name: "Naam",
    proposedBy: "Voorgesteld door {club}",
    shared: "Gemeenschappelijke lijst",
    validate: "Valideren",
    refuseModel: "Weigeren",
    chairsCount: "{n} rolstoel(en)",
    noModels: "Geen model.",
    saved: "Opgeslagen.",
    errors: {
      MODEL_REQUIRED: "Kies een model of stel er een voor.",
      ACQUIRED_REQUIRED: "De aankoopdatum is verplicht.",
      LOAN_DATES: "Controleer de data: het einde na het begin, en niets in het verleden.",
      LOAN_OVERLAP: "Deze rolstoel is op die data al uitgeleend.",
      NO_FEDERATION: "Uitleningen gebeuren tussen clubs van dezelfde federatie.",
      NOT_FOUND: "Niet gevonden, of niet meer beschikbaar.",
    },
  },
  en: {
    tabsLabel: "Equipment sections",
    tabs: { chairs: "Chairs", small: "Small equipment", lending: "Loans between clubs", places: "Storage places", models: "Chair models" },
    fleetIntro: "The federation's fleet: its chairs, lent to the clubs with the same screens.",
    addChair: "Add a chair",
    cols: { name: "Chair", model: "Model", acquired: "Purchase date", status: "Condition", players: "Players", place: "Storage place", nextService: "Next service", loan: "Loan" },
    model: "Model",
    allModels: "All models",
    place: "Place",
    allPlaces: "All places",
    modelStatus: { validated: "Validated", proposed: "Awaiting validation", refused: "Refused" },
    noModel: "Model to fill in",
    sheetTabs: { facts: "Sheet", edit: "Edit", lend: "Lend", service: "Maintenance", history: "History" },
    expand: "Expand",
    expandOf: "Expand the sheet of {name} to a full page",
    close: "Close",
    back: "Back to equipment",
    notFound: "This chair does not exist or is not visible with this profile.",
    chooseModel: "Choose a model",
    proposeModel: "Propose a new model…",
    newBrand: "Brand of the new model",
    newName: "Name of the new model",
    proposeHint: "The model is proposed to the federation; the chair shows « Awaiting validation » until it decides.",
    acquired: "Purchase date",
    noPlace: "No place",
    lendable: "Lendable",
    lendableHint: "Visible to the other clubs of the federation, who can ask for a loan.",
    required: "required",
    toPlayer: "To a player of the club",
    toClub: "To another club",
    borrower: "Borrowing club",
    starts: "From",
    ends: "To",
    conditions: "Conditions",
    deposit: "Deposit in euros (optional)",
    lendButton: "Lend the chair",
    noPartner: "No other club in the federation.",
    serviceDone: "Serviced on",
    serviceNext: "Next service",
    serviceNote: "What was done",
    markService: "Note the service",
    history: {
      create: "Created",
      update: "Edited",
      assign: "Assigned to a player",
      unassign: "Assignment ended",
      service: "Service",
      "loan.lend": "Lent",
      "loan.request": "Loan requested",
      "loan.accept": "Loan accepted",
      "loan.refuse": "Loan refused",
      "loan.cancel": "Loan cancelled",
      "loan.handOver": "Handed to the borrower",
      "loan.return": "Returned",
    },
    noHistory: "No event.",
    lentTo: "Lent to {club} until {date}",
    lentBy: "Lent by {club} until {date}",
    reservedFor: "Reserved for {club} from {from} to {to}",
    borrowedTitle: "Borrowed chairs",
    borrowedIntro: "The chairs another club or the federation lends you.",
    available: "Chairs available for loan",
    availableIntro: "The chairs the clubs and the federation marked « Lendable ».",
    owner: "Owner",
    availability: "Availability",
    free: "Free",
    busyRange: "Lent from {from} to {to}",
    ask: "Ask for a loan",
    askOf: "Ask for a loan: {name}",
    message: "Message (optional)",
    sendRequest: "Send the request",
    noAvailable: "No chair is offered for loan right now.",
    lent: "My loans and requests received",
    borrowed: "My borrowings and requests sent",
    noLoan: "No loan.",
    loanCols: { chair: "Chair", club: "Club", dates: "Dates", status: "Status", details: "Follow-up" },
    loanStatus: { requested: "Requested", accepted: "Accepted", ongoing: "Ongoing", returned: "Returned", refused: "Refused", cancelled: "Cancelled" },
    accept: "Accept",
    refuse: "Refuse",
    decisionNote: "Answer (optional)",
    handOver: "Hand over the chair",
    conditionOut: "Condition on departure",
    conditionIn: "Condition on return",
    markReturned: "Note the return",
    cancelLoan: "Cancel",
    fromTo: "from {from} to {to}",
    depositOf: "Deposit: {amount}",
    addPlace: "Add a place",
    placeName: "Name of the place",
    clubPlace: "Place of the club",
    noClubPlace: "None",
    address: "Address",
    contact: "Contact",
    access: "Access (keys, hours)",
    notes: "Notes",
    archivedPlace: "Place no longer used",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    editOf: "Edit: {name}",
    storedAt: "What is stored at {name}",
    noStored: "Nothing is kept there.",
    noPlaces: "No storage place yet.",
    chairsLabel: "Chairs",
    itemsLabel: "Small equipment",
    models: "Chair models",
    modelsIntro: "The models your clubs propose await your decision; a validated model joins the list of all your clubs.",
    brand: "Brand",
    name: "Name",
    proposedBy: "Proposed by {club}",
    shared: "Shared list",
    validate: "Validate",
    refuseModel: "Refuse",
    chairsCount: "{n} chair(s)",
    noModels: "No model.",
    saved: "Saved.",
    errors: {
      MODEL_REQUIRED: "Choose a model or propose one.",
      ACQUIRED_REQUIRED: "The purchase date is required.",
      LOAN_DATES: "Check the dates: the end after the start, and nothing in the past.",
      LOAN_OVERLAP: "This chair is already lent on these dates.",
      NO_FEDERATION: "Loans happen between clubs of the same federation.",
      NOT_FOUND: "Not found, or no longer available.",
    },
  },
};
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
