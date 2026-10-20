import type { Locale } from "../lib/locale";
type Copy = {
  title: string;
  intro: string;
  balance: string;
  balanceHint: string;
  income: string;
  expenses: string;
  duesPlanned: string;
  duesHint: string;
  season: string;
  byCategory: string;
  history: string;
  add: string;
  close: string;
  date: string;
  label: string;
  direction: string;
  in: string;
  out: string;
  category: string;
  amount: string;
  method: string;
  counterparty: string;
  reference: string;
  notes: string;
  save: string;
  saved: string;
  search: string;
  all: string;
  export: string;
  cancel: string;
  cancelReason: string;
  confirmCancel: string;
  cancelled: string;
  empty: string;
  author: string;
  restricted: string;
  dues: string;
  duesText: string;
  openDues: string;
  bankNote: string;
  categories: Record<string, string>;
  methods: Record<string, string>;
};
export const financeCopy: Record<Locale, Copy> = {
  fr: {
    title: "Finance du club",
    intro:
      "Trésorerie du club : recettes, dépenses et historique des opérations.",
    balance: "Trésorerie",
    balanceHint: "Solde de toutes les opérations enregistrées",
    income: "Recettes",
    expenses: "Dépenses",
    duesPlanned: "Cotisations prévues",
    duesHint: "dont {amount} dans les 30 jours",
    season: "Saison",
    byCategory: "Répartition par catégorie",
    history: "Historique des opérations",
    add: "Ajouter une opération",
    close: "Fermer",
    date: "Date",
    label: "Libellé",
    direction: "Sens",
    in: "Recette",
    out: "Dépense",
    category: "Catégorie",
    amount: "Montant (€)",
    method: "Moyen",
    counterparty: "Tiers (donateur, fournisseur…)",
    reference: "Référence (communication, facture)",
    notes: "Remarques",
    save: "Enregistrer l’opération",
    saved: "Enregistré.",
    search: "Rechercher",
    all: "Toutes",
    export: "Exporter (CSV)",
    cancel: "Annuler",
    cancelReason: "Motif de l’annulation",
    confirmCancel: "Confirmer l’annulation",
    cancelled: "Annulée",
    empty: "Aucune opération enregistrée pour l’instant.",
    author: "Saisie par",
    restricted:
      "La trésorerie est réservée aux personnes chargées des finances (permission « Gérer les cotisations »).",
    dues: "Cotisations",
    duesText: "Barèmes, créances et échéanciers des membres.",
    openDues: "Ouvrir les cotisations",
    bankNote:
      "Les opérations sont saisies à la main. L’import des relevés bancaires et le rapprochement des paiements arriveront avec le lot bancaire : les cotisations restent des montants prévus tant qu’ils ne sont pas rapprochés.",
    categories: {
      dues: "Cotisations",
      subsidy: "Subsides",
      sponsor: "Sponsoring",
      donation: "Dons",
      event: "Événements",
      equipment: "Matériel",
      venue: "Salles",
      travel: "Déplacements",
      competition: "Compétitions",
      insurance: "Assurances",
      other: "Autre",
    },
    methods: {
      transfer: "Virement",
      cash: "Espèces",
      card: "Carte",
      other: "Autre",
    },
  },
  nl: {
    title: "Clubfinanciën",
    intro: "Kas van de club: inkomsten, uitgaven en verrichtingen.",
    balance: "Kas",
    balanceHint: "Saldo van alle geregistreerde verrichtingen",
    income: "Inkomsten",
    expenses: "Uitgaven",
    duesPlanned: "Geplande bijdragen",
    duesHint: "waarvan {amount} binnen 30 dagen",
    season: "Seizoen",
    byCategory: "Verdeling per categorie",
    history: "Verrichtingen",
    add: "Verrichting toevoegen",
    close: "Sluiten",
    date: "Datum",
    label: "Omschrijving",
    direction: "Richting",
    in: "Inkomst",
    out: "Uitgave",
    category: "Categorie",
    amount: "Bedrag (€)",
    method: "Betaalwijze",
    counterparty: "Tegenpartij (schenker, leverancier…)",
    reference: "Referentie (mededeling, factuur)",
    notes: "Opmerkingen",
    save: "Verrichting opslaan",
    saved: "Opgeslagen.",
    search: "Zoeken",
    all: "Alle",
    export: "Exporteren (CSV)",
    cancel: "Annuleren",
    cancelReason: "Reden van annulering",
    confirmCancel: "Annulering bevestigen",
    cancelled: "Geannuleerd",
    empty: "Nog geen verrichtingen geregistreerd.",
    author: "Ingevoerd door",
    restricted:
      "De kas is voorbehouden aan wie de financiën beheert (recht ‘Bijdragen beheren’).",
    dues: "Bijdragen",
    duesText: "Tarieven, vorderingen en afbetalingsplannen van leden.",
    openDues: "Bijdragen openen",
    bankNote:
      "Verrichtingen worden manueel ingevoerd. Het importeren van bankafschriften en het afpunten van betalingen volgt met de bankfase: bijdragen blijven geplande bedragen tot ze afgepunt zijn.",
    categories: {
      dues: "Bijdragen",
      subsidy: "Subsidies",
      sponsor: "Sponsoring",
      donation: "Giften",
      event: "Evenementen",
      equipment: "Materiaal",
      venue: "Zalen",
      travel: "Verplaatsingen",
      competition: "Competities",
      insurance: "Verzekeringen",
      other: "Andere",
    },
    methods: {
      transfer: "Overschrijving",
      cash: "Contant",
      card: "Kaart",
      other: "Andere",
    },
  },
  en: {
    title: "Club finances",
    intro: "Club treasury: income, expenses and transaction history.",
    balance: "Treasury",
    balanceHint: "Balance of all recorded transactions",
    income: "Income",
    expenses: "Expenses",
    duesPlanned: "Scheduled dues",
    duesHint: "of which {amount} within 30 days",
    season: "Season",
    byCategory: "By category",
    history: "Transaction history",
    add: "Add a transaction",
    close: "Close",
    date: "Date",
    label: "Description",
    direction: "Type",
    in: "Income",
    out: "Expense",
    category: "Category",
    amount: "Amount (€)",
    method: "Method",
    counterparty: "Counterparty (donor, supplier…)",
    reference: "Reference (payment note, invoice)",
    notes: "Notes",
    save: "Save transaction",
    saved: "Saved.",
    search: "Search",
    all: "All",
    export: "Export (CSV)",
    cancel: "Cancel",
    cancelReason: "Reason for cancelling",
    confirmCancel: "Confirm cancellation",
    cancelled: "Cancelled",
    empty: "No transaction recorded yet.",
    author: "Recorded by",
    restricted:
      "The treasury is reserved for people in charge of finances (‘Manage dues’ permission).",
    dues: "Dues",
    duesText: "Member rates, receivables and instalment plans.",
    openDues: "Open dues",
    bankNote:
      "Transactions are entered by hand. Bank statement import and payment reconciliation will come with the bank module: dues stay scheduled amounts until they are reconciled.",
    categories: {
      dues: "Dues",
      subsidy: "Grants",
      sponsor: "Sponsorship",
      donation: "Donations",
      event: "Events",
      equipment: "Equipment",
      venue: "Venues",
      travel: "Travel",
      competition: "Competitions",
      insurance: "Insurance",
      other: "Other",
    },
    methods: {
      transfer: "Transfer",
      cash: "Cash",
      card: "Card",
      other: "Other",
    },
  },
};

/** Budget, receipts, dues payments and annual report (vague 2). */
export const financeExtras = {
  fr: {
    payment: "Paiement de cotisation (facultatif)",
    paymentNone: "Aucune : autre recette ou dépense",
    paymentHint:
      "Choisir une cotisation enregistre une recette « Cotisations » : le joueur ne sera plus relancé pour le montant payé.",
    left: "reste",
    collected: "{amount} déjà encaissés",
    receipts: "Justificatifs",
    attach: "Joindre",
    attachLabel: "Joindre un justificatif (PDF ou photo, 5 Mo)",
    attached: "Justificatif ajouté.",
    removeReceipt: "Retirer",
    budget: "Budget de la saison",
    readOnly:
      "Accès en lecture seule : vous consultez les comptes sans pouvoir les modifier.",
    trip: "Déplacement (facultatif)",
    tripNone: "Aucun",
    budgetIntro:
      "Montants prévus par catégorie, comparés au réel. Un écart positif est favorable au club.",
    planned: "Prévu",
    actual: "Réel",
    gap: "Écart",
    used: "utilisé",
    editBudget: "Modifier le budget",
    saveBudget: "Enregistrer le budget",
    budgetSaved: "Budget enregistré.",
    noBudget: "Aucun budget pour cette saison.",
    report: "Rapport annuel",
    reportIntro:
      "Pour l'assemblée générale et le comptable : soldes, recettes et dépenses par catégorie, budget et détail des opérations.",
    reportSeason: "Saison",
    openReport: "Ouvrir le rapport (impression ou PDF)",
    csv: "Télécharger en CSV",
    print: "Imprimer ou enregistrer en PDF",
    opening: "Solde d'ouverture",
    closing: "Solde de clôture",
    generated: "Généré le",
    lines: "Détail des opérations",
    back: "Retour au financement",
    yes: "oui",
  },
  nl: {
    payment: "Betaling van lidgeld (optioneel)",
    paymentNone: "Geen: andere inkomst of uitgave",
    paymentHint:
      "Een lidgeld kiezen boekt een inkomst « Lidgelden »: de speler krijgt geen herinnering meer voor het betaalde bedrag.",
    left: "resterend",
    collected: "{amount} al ontvangen",
    receipts: "Bewijsstukken",
    attach: "Toevoegen",
    attachLabel: "Bewijsstuk toevoegen (PDF of foto, 5 MB)",
    attached: "Bewijsstuk toegevoegd.",
    removeReceipt: "Verwijderen",
    budget: "Budget van het seizoen",
    readOnly:
      "Alleen-lezen: u raadpleegt de rekeningen zonder ze te kunnen wijzigen.",
    trip: "Verplaatsing (optioneel)",
    tripNone: "Geen",
    budgetIntro:
      "Geplande bedragen per categorie, vergeleken met de realiteit. Een positief verschil is gunstig voor de club.",
    planned: "Gepland",
    actual: "Werkelijk",
    gap: "Verschil",
    used: "gebruikt",
    editBudget: "Budget wijzigen",
    saveBudget: "Budget opslaan",
    budgetSaved: "Budget opgeslagen.",
    noBudget: "Geen budget voor dit seizoen.",
    report: "Jaarverslag",
    reportIntro:
      "Voor de algemene vergadering en de boekhouder: saldi, inkomsten en uitgaven per categorie, budget en detail van de verrichtingen.",
    reportSeason: "Seizoen",
    openReport: "Verslag openen (afdrukken of PDF)",
    csv: "Downloaden als CSV",
    print: "Afdrukken of opslaan als PDF",
    opening: "Beginsaldo",
    closing: "Eindsaldo",
    generated: "Aangemaakt op",
    lines: "Detail van de verrichtingen",
    back: "Terug naar financiering",
    yes: "ja",
  },
  en: {
    payment: "Dues payment (optional)",
    paymentNone: "None: other income or expense",
    paymentHint:
      "Choosing a member's dues records a « Dues » income: they will no longer be reminded for the amount paid.",
    left: "left",
    collected: "{amount} already collected",
    receipts: "Receipts",
    attach: "Attach",
    attachLabel: "Attach a receipt (PDF or photo, 5 MB)",
    attached: "Receipt attached.",
    removeReceipt: "Remove",
    budget: "Season budget",
    readOnly: "Read-only access: you can see the accounts but not change them.",
    trip: "Trip (optional)",
    tripNone: "None",
    budgetIntro:
      "Planned amounts per category compared with actuals. A positive gap is good for the club.",
    planned: "Planned",
    actual: "Actual",
    gap: "Gap",
    used: "used",
    editBudget: "Edit budget",
    saveBudget: "Save budget",
    budgetSaved: "Budget saved.",
    noBudget: "No budget for this season.",
    report: "Annual report",
    reportIntro:
      "For the general assembly and the accountant: balances, income and expenses per category, budget and every line.",
    reportSeason: "Season",
    openReport: "Open the report (print or PDF)",
    csv: "Download as CSV",
    print: "Print or save as PDF",
    opening: "Opening balance",
    closing: "Closing balance",
    generated: "Generated on",
    lines: "All lines",
    back: "Back to funding",
    yes: "yes",
  },
};
