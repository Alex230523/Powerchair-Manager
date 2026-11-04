import type { Locale } from "@/lib/locale";

/** 18: the halls' bookings on the Places page, in fr, nl, en. */
type Copy = {
  title: string;
  intro: string;
  none: string;
  loading: string;
  season: string;
  noSeason: string;
  statuses: Record<"to_request" | "requested" | "confirmed" | "refused" | "cancelled", string>;
  status: string;
  reference: string;
  saveStatus: string;
  sessions: string;
  slots: string;
  planned: string;
  invoiced: string;
  paid: string;
  perTeam: string;
  wholeClub: string;
  teamLine: string;
  settings: string;
  billing: string;
  billings: Record<"per_session" | "monthly" | "quarterly" | "yearly", string>;
  rate: string;
  noRate: string;
  notes: string;
  saveSettings: string;
  email: string;
  emailTo: string;
  openMail: string;
  copy: string;
  copied: string;
  confirmation: string;
  confirmationOpen: string;
  upload: string;
  invoices: string;
  noInvoice: string;
  period: string;
  amount: string;
  issuedOn: string;
  file: string;
  addInvoice: string;
  invoiceLine: string;
  gap: string;
  onPlan: string;
  expense: string;
  expenseDate: string;
  expenseLabel: string;
  expenseSave: string;
  recorded: string;
  removeInvoice: string;
  openFile: string;
  saved: string;
  refresh: string;
  errors: Record<string, string>;
};
export const venueBookingsCopy: Record<Locale, Copy> = {
  fr: {
    title: "Réservations de salles",
    intro: "Calculées à partir de l'agenda : chaque salle à réserver a une réservation par saison, avec ses créneaux, son coût prévu au tarif en cours et ses factures. Les tâches (demander, relancer, payer, prévenir la salle) arrivent seules dans la to-do.",
    none: "Aucune séance prévue dans une salle à réserver.",
    loading: "Chargement des réservations…",
    season: "Saison {season}",
    noSeason: "Hors saison",
    statuses: { to_request: "À demander", requested: "Demandée", confirmed: "Confirmée", refused: "Refusée", cancelled: "Annulée" },
    status: "Statut",
    reference: "Référence",
    saveStatus: "Enregistrer le statut",
    sessions: "{n} séance(s)",
    slots: "Créneaux",
    planned: "Coût prévu",
    invoiced: "Facturé",
    paid: "Payé",
    perTeam: "Par équipe",
    wholeClub: "Club entier",
    teamLine: "{team} : {n} séance(s), {amount}",
    settings: "Facturation",
    billing: "Rythme de facturation",
    billings: { per_session: "Par séance", monthly: "Mensuel", quarterly: "Trimestriel", yearly: "Annuel" },
    rate: "Tarif appliqué",
    noRate: "Aucun tarif",
    notes: "Remarques",
    saveSettings: "Enregistrer la facturation",
    email: "Email prêt à envoyer",
    emailTo: "À : {to}",
    openMail: "Ouvrir dans la messagerie",
    copy: "Copier l'email",
    copied: "Email copié.",
    confirmation: "Document de confirmation",
    confirmationOpen: "Ouvrir la confirmation",
    upload: "Déposer le fichier (PDF ou image, 5 Mo)",
    invoices: "Factures",
    noInvoice: "Aucune facture pour l'instant.",
    period: "Période",
    amount: "Montant (€)",
    issuedOn: "Date de la facture",
    file: "Fichier de la facture (PDF ou image)",
    addInvoice: "Ajouter la facture",
    invoiceLine: "{period} : {amount}, du {date}",
    gap: "Écart {gap}",
    onPlan: "Conforme au prévu",
    expense: "Enregistrer la dépense",
    expenseDate: "Date de paiement",
    expenseLabel: "Libellé",
    expenseSave: "Enregistrer la dépense",
    recorded: "Dépense enregistrée",
    removeInvoice: "Retirer la facture",
    openFile: "Ouvrir la facture",
    saved: "Enregistré.",
    refresh: "Recalculer depuis l'agenda",
    errors: { ALREADY_RECORDED: "La dépense de cette facture est déjà enregistrée.", INVALID_FILE: "Le fichier doit être un PDF ou une image de 5 Mo au plus." },
  },
  nl: {
    title: "Zaalreservaties",
    intro: "Berekend uit de agenda: elke zaal om te reserveren heeft één reservatie per seizoen, met haar momenten, de voorziene kost aan het geldende tarief en haar facturen. De taken (aanvragen, opnieuw contacteren, betalen, de zaal verwittigen) komen vanzelf in de to-do.",
    none: "Geen sessie gepland in een zaal om te reserveren.",
    loading: "Reservaties laden…",
    season: "Seizoen {season}",
    noSeason: "Buiten seizoen",
    statuses: { to_request: "Aan te vragen", requested: "Aangevraagd", confirmed: "Bevestigd", refused: "Geweigerd", cancelled: "Geannuleerd" },
    status: "Status",
    reference: "Referentie",
    saveStatus: "De status bewaren",
    sessions: "{n} sessie(s)",
    slots: "Momenten",
    planned: "Voorziene kost",
    invoiced: "Gefactureerd",
    paid: "Betaald",
    perTeam: "Per ploeg",
    wholeClub: "Hele club",
    teamLine: "{team}: {n} sessie(s), {amount}",
    settings: "Facturatie",
    billing: "Facturatieritme",
    billings: { per_session: "Per sessie", monthly: "Maandelijks", quarterly: "Driemaandelijks", yearly: "Jaarlijks" },
    rate: "Toegepast tarief",
    noRate: "Geen tarief",
    notes: "Opmerkingen",
    saveSettings: "De facturatie bewaren",
    email: "E-mail klaar om te versturen",
    emailTo: "Aan: {to}",
    openMail: "Openen in de mailtoepassing",
    copy: "De e-mail kopiëren",
    copied: "E-mail gekopieerd.",
    confirmation: "Bevestigingsdocument",
    confirmationOpen: "De bevestiging openen",
    upload: "Het bestand opladen (pdf of afbeelding, 5 MB)",
    invoices: "Facturen",
    noInvoice: "Nog geen factuur.",
    period: "Periode",
    amount: "Bedrag (€)",
    issuedOn: "Factuurdatum",
    file: "Bestand van de factuur (pdf of afbeelding)",
    addInvoice: "De factuur toevoegen",
    invoiceLine: "{period}: {amount}, van {date}",
    gap: "Verschil {gap}",
    onPlan: "Zoals voorzien",
    expense: "De uitgave boeken",
    expenseDate: "Betaaldatum",
    expenseLabel: "Omschrijving",
    expenseSave: "De uitgave boeken",
    recorded: "Uitgave geboekt",
    removeInvoice: "De factuur verwijderen",
    openFile: "De factuur openen",
    saved: "Bewaard.",
    refresh: "Herberekenen uit de agenda",
    errors: { ALREADY_RECORDED: "De uitgave van deze factuur is al geboekt.", INVALID_FILE: "Het bestand moet een pdf of afbeelding van maximaal 5 MB zijn." },
  },
  en: {
    title: "Hall bookings",
    intro: "Worked out from the calendar: each hall to book has one booking per season, with its slots, its planned cost at the current rate and its invoices. The tasks (request, follow up, pay, tell the hall) reach the to-do by themselves.",
    none: "No session planned in a hall to book.",
    loading: "Loading the bookings…",
    season: "Season {season}",
    noSeason: "Out of season",
    statuses: { to_request: "To request", requested: "Requested", confirmed: "Confirmed", refused: "Refused", cancelled: "Cancelled" },
    status: "Status",
    reference: "Reference",
    saveStatus: "Save the status",
    sessions: "{n} session(s)",
    slots: "Slots",
    planned: "Planned cost",
    invoiced: "Invoiced",
    paid: "Paid",
    perTeam: "Per team",
    wholeClub: "Whole club",
    teamLine: "{team}: {n} session(s), {amount}",
    settings: "Billing",
    billing: "Billing rhythm",
    billings: { per_session: "Per session", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" },
    rate: "Rate applied",
    noRate: "No rate",
    notes: "Notes",
    saveSettings: "Save the billing",
    email: "Email ready to send",
    emailTo: "To: {to}",
    openMail: "Open in the mail app",
    copy: "Copy the email",
    copied: "Email copied.",
    confirmation: "Confirmation document",
    confirmationOpen: "Open the confirmation",
    upload: "Upload the file (PDF or image, 5 MB)",
    invoices: "Invoices",
    noInvoice: "No invoice yet.",
    period: "Period",
    amount: "Amount (€)",
    issuedOn: "Invoice date",
    file: "Invoice file (PDF or image)",
    addInvoice: "Add the invoice",
    invoiceLine: "{period}: {amount}, of {date}",
    gap: "Gap {gap}",
    onPlan: "As planned",
    expense: "Record the expense",
    expenseDate: "Payment date",
    expenseLabel: "Label",
    expenseSave: "Record the expense",
    recorded: "Expense recorded",
    removeInvoice: "Remove the invoice",
    openFile: "Open the invoice",
    saved: "Saved.",
    refresh: "Recompute from the calendar",
    errors: { ALREADY_RECORDED: "This invoice's expense is already recorded.", INVALID_FILE: "The file must be a PDF or an image of 5 MB at most." },
  },
};
