/** Wave 17 (C4): the club's places, their sheet, their rates and their sharing. */
type Copy = {
  title: string;
  intro: string;
  tabs: string;
  categories: Record<"training" | "other", string>;
  categoryHints: Record<"training" | "other", string>;
  ours: string;
  noPlace: string;
  add: string;
  edit: string;
  editOf: string;
  name: string;
  address: string;
  category: string;
  contact: string;
  noContact: string;
  newContact: string;
  pickContact: string;
  contactName: string;
  contactCompany: string;
  contactEmail: string;
  contactPhone: string;
  capacity: string;
  accessibility: string;
  access: Record<"accessible" | "toilets" | "parking" | "storage" | "charging", string>;
  home: string;
  homeBadge: string;
  food: string;
  notes: string;
  archived: string;
  save: string;
  cancel: string;
  saved: string;
  rates: string;
  current: string;
  history: string;
  noRate: string;
  addRate: string;
  addRateOf: string;
  rateLabel: string;
  rateAmount: string;
  rateUnit: string;
  rateFrom: string;
  rateAdded: string;
  share: Record<"private" | "pending" | "approved" | "refused", string>;
  propose: string;
  proposeOf: string;
  proposed: string;
  sharedHint: string;
  refusedBecause: string;
  directory: string;
  directoryIntro: string;
  proposals: string;
  proposalsIntro: string;
  noProposal: string;
  fromClub: string;
  approve: string;
  approveOf: string;
  refuse: string;
  refuseOf: string;
  reason: string;
  decided: string;
  withdraw: string;
  withdrawOf: string;
  withdrawn: string;
  manage: string;
};

export const placesCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    title: "Lieux",
    intro: "Les salles d'entraînement et de match, et les autres lieux du club. La fiche reste privée ; seuls le nom, l'adresse, la catégorie et l'accessibilité peuvent être partagés, après validation par la fédération.",
    tabs: "Catégories de lieux",
    categories: { training: "Entraînement et match", other: "Autres lieux" },
    categoryHints: { training: "Salle de sport, avec accessibilité et terrain.", other: "Local, restaurant, salle de réunion, hébergement." },
    ours: "Nos lieux",
    noPlace: "Aucun lieu dans cette catégorie.",
    add: "Ajouter un lieu",
    edit: "Modifier",
    editOf: "Modifier le lieu {name}",
    name: "Nom du lieu",
    address: "Adresse",
    category: "Catégorie",
    contact: "Personne de contact",
    noContact: "Aucune",
    newContact: "Créer un contact",
    pickContact: "Choisir dans le carnet",
    contactName: "Nom du contact",
    contactCompany: "Organisation (facultative)",
    contactEmail: "Email (facultatif)",
    contactPhone: "Téléphone (facultatif)",
    capacity: "Capacité (facultative)",
    accessibility: "Accessibilité",
    access: { accessible: "Accès PMR", toilets: "Toilettes adaptées", parking: "Parking", storage: "Rangement", charging: "Recharge" },
    home: "Notre salle d'entraînement (domicile)",
    homeBadge: "Domicile",
    food: "Nourriture et boissons",
    notes: "Notes",
    archived: "Archivé",
    save: "Enregistrer le lieu",
    cancel: "Annuler",
    saved: "Lieu enregistré.",
    rates: "Tarifs",
    current: "En cours",
    history: "Historique des tarifs",
    noRate: "Aucun tarif.",
    addRate: "Ajouter un tarif",
    addRateOf: "Ajouter un tarif : {name}",
    rateLabel: "Libellé (par exemple « terrain 2 h »)",
    rateAmount: "Montant (€)",
    rateUnit: "Unité (facultative)",
    rateFrom: "Valable à partir du",
    rateAdded: "ajouté le {date} par {name}",
    share: { private: "Privé", pending: "En attente de validation", approved: "Validé", refused: "Refusé" },
    propose: "Proposer au partage",
    proposeOf: "Proposer au partage : {name}",
    proposed: "Proposition envoyée à la fédération.",
    sharedHint: "Seuls le nom, l'adresse, la catégorie et l'accessibilité seront partagés.",
    refusedBecause: "Motif : {reason}",
    directory: "Annuaire partagé de la fédération",
    directoryIntro: "Les lieux validés par la fédération, visibles par ses clubs.",
    proposals: "Propositions des clubs",
    proposalsIntro: "Lieux proposés au partage. Seuls le nom, l'adresse, la catégorie et l'accessibilité sont montrés et partagés.",
    noProposal: "Aucune proposition en attente.",
    fromClub: "proposé par {club}",
    approve: "Valider",
    approveOf: "Valider : {name}",
    refuse: "Refuser",
    refuseOf: "Refuser : {name}",
    reason: "Motif",
    decided: "Décision enregistrée.",
    withdraw: "Retirer",
    withdrawOf: "Retirer de l'annuaire : {name}",
    withdrawn: "Lieu retiré de l'annuaire.",
    manage: "Gérer les lieux",
  },
  nl: {
    title: "Locaties",
    intro: "De trainings- en wedstrijdzalen en de andere locaties van de club. De fiche blijft privé; enkel naam, adres, categorie en toegankelijkheid kunnen gedeeld worden, na validatie door de federatie.",
    tabs: "Categorieën van locaties",
    categories: { training: "Training en wedstrijd", other: "Andere locaties" },
    categoryHints: { training: "Sporthal, met toegankelijkheid en terrein.", other: "Lokaal, restaurant, vergaderzaal, logies." },
    ours: "Onze locaties",
    noPlace: "Geen locatie in deze categorie.",
    add: "Locatie toevoegen",
    edit: "Wijzigen",
    editOf: "De locatie {name} wijzigen",
    name: "Naam van de locatie",
    address: "Adres",
    category: "Categorie",
    contact: "Contactpersoon",
    noContact: "Geen",
    newContact: "Een contact aanmaken",
    pickContact: "Kiezen uit het adresboek",
    contactName: "Naam van het contact",
    contactCompany: "Organisatie (optioneel)",
    contactEmail: "E-mail (optioneel)",
    contactPhone: "Telefoon (optioneel)",
    capacity: "Capaciteit (optioneel)",
    accessibility: "Toegankelijkheid",
    access: { accessible: "Toegankelijk", toilets: "Aangepaste toiletten", parking: "Parking", storage: "Opslag", charging: "Opladen" },
    home: "Onze trainingszaal (thuis)",
    homeBadge: "Thuis",
    food: "Eten en drinken",
    notes: "Notities",
    archived: "Gearchiveerd",
    save: "Locatie opslaan",
    cancel: "Annuleren",
    saved: "Locatie opgeslagen.",
    rates: "Tarieven",
    current: "Huidig",
    history: "Historiek van de tarieven",
    noRate: "Geen tarief.",
    addRate: "Een tarief toevoegen",
    addRateOf: "Een tarief toevoegen: {name}",
    rateLabel: "Omschrijving (bijvoorbeeld « terrein 2 u »)",
    rateAmount: "Bedrag (€)",
    rateUnit: "Eenheid (optioneel)",
    rateFrom: "Geldig vanaf",
    rateAdded: "toegevoegd op {date} door {name}",
    share: { private: "Privé", pending: "Wacht op validatie", approved: "Gevalideerd", refused: "Geweigerd" },
    propose: "Voorstellen om te delen",
    proposeOf: "Voorstellen om te delen: {name}",
    proposed: "Voorstel verstuurd naar de federatie.",
    sharedHint: "Enkel naam, adres, categorie en toegankelijkheid worden gedeeld.",
    refusedBecause: "Reden: {reason}",
    directory: "Gedeelde gids van de federatie",
    directoryIntro: "De locaties gevalideerd door de federatie, zichtbaar voor haar clubs.",
    proposals: "Voorstellen van de clubs",
    proposalsIntro: "Locaties voorgesteld om te delen. Enkel naam, adres, categorie en toegankelijkheid worden getoond en gedeeld.",
    noProposal: "Geen voorstel in afwachting.",
    fromClub: "voorgesteld door {club}",
    approve: "Valideren",
    approveOf: "Valideren: {name}",
    refuse: "Weigeren",
    refuseOf: "Weigeren: {name}",
    reason: "Reden",
    decided: "Beslissing opgeslagen.",
    withdraw: "Intrekken",
    withdrawOf: "Uit de gids halen: {name}",
    withdrawn: "Locatie uit de gids gehaald.",
    manage: "Locaties beheren",
  },
  en: {
    title: "Places",
    intro: "The club's training and match halls and its other places. The sheet stays private; only the name, address, category and accessibility can be shared, once the federation validates them.",
    tabs: "Place categories",
    categories: { training: "Training and match", other: "Other places" },
    categoryHints: { training: "Sports hall, with accessibility and court.", other: "Premises, restaurant, meeting room, lodging." },
    ours: "Our places",
    noPlace: "No place in this category.",
    add: "Add a place",
    edit: "Edit",
    editOf: "Edit the place {name}",
    name: "Place name",
    address: "Address",
    category: "Category",
    contact: "Contact person",
    noContact: "None",
    newContact: "Create a contact",
    pickContact: "Choose from the contacts book",
    contactName: "Contact name",
    contactCompany: "Organisation (optional)",
    contactEmail: "Email (optional)",
    contactPhone: "Phone (optional)",
    capacity: "Capacity (optional)",
    accessibility: "Accessibility",
    access: { accessible: "Step-free access", toilets: "Adapted toilets", parking: "Parking", storage: "Storage", charging: "Charging" },
    home: "Our training hall (home)",
    homeBadge: "Home",
    food: "Food and drinks",
    notes: "Notes",
    archived: "Archived",
    save: "Save the place",
    cancel: "Cancel",
    saved: "Place saved.",
    rates: "Rates",
    current: "Current",
    history: "Rate history",
    noRate: "No rate.",
    addRate: "Add a rate",
    addRateOf: "Add a rate: {name}",
    rateLabel: "Label (for example « court 2 h »)",
    rateAmount: "Amount (€)",
    rateUnit: "Unit (optional)",
    rateFrom: "Valid from",
    rateAdded: "added on {date} by {name}",
    share: { private: "Private", pending: "Awaiting validation", approved: "Validated", refused: "Refused" },
    propose: "Propose for sharing",
    proposeOf: "Propose for sharing: {name}",
    proposed: "Proposal sent to the federation.",
    sharedHint: "Only the name, address, category and accessibility will be shared.",
    refusedBecause: "Reason: {reason}",
    directory: "Federation's shared directory",
    directoryIntro: "Places validated by the federation, seen by its clubs.",
    proposals: "Clubs' proposals",
    proposalsIntro: "Places proposed for sharing. Only the name, address, category and accessibility are shown and shared.",
    noProposal: "No proposal waiting.",
    fromClub: "proposed by {club}",
    approve: "Validate",
    approveOf: "Validate: {name}",
    refuse: "Refuse",
    refuseOf: "Refuse: {name}",
    reason: "Reason",
    decided: "Decision saved.",
    withdraw: "Withdraw",
    withdrawOf: "Withdraw from the directory: {name}",
    withdrawn: "Place withdrawn from the directory.",
    manage: "Manage places",
  },
};
