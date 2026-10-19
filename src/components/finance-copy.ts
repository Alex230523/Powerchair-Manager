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
    title: "Financement",
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
    title: "Financiering",
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
    title: "Funding",
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
