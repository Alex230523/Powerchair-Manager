/** Wave 17 (N1): the « Finances » page restructured: add, delete, statements. */
type Copy = {
  add: string;
  more: string;
  export: string;
  annualReport: string;
  kind: string;
  expense: string;
  income: string;
  receipt: string;
  receiptHint: string;
  deleteOf: string;
  deleteTitle: string;
  deleteText: string;
  deleteReason: string;
  deleteConfirm: string;
  deleted: string;
  linked: { dues: string; sponsor: string; affiliation: string };
  linkedTitle: string;
  open: string;
  yearApproved: string;
  next30: string;
  next30Hint: string;
  last: string;
  seeAll: string;
  cancel: string;
  statementsTitle: string;
  statementsIntro: string;
  upload: string;
  account: string;
  accountHint: string;
  month: string;
  balance: string;
  balanceHint: string;
  file: string;
  fileHint: string;
  closing: string;
  platform: string;
  gap: string;
  equal: string;
  unknown: string;
  fromCsv: string;
  none: string;
  removeOf: string;
  removed: string;
  uploaded: string;
  lot09: string;
};

export const financeSectionsCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    add: "Ajouter une opération",
    more: "Plus d'actions sur les finances",
    export: "Exporter les opérations",
    annualReport: "Rapport annuel",
    kind: "Type d'opération",
    expense: "Dépense",
    income: "Recette",
    receipt: "Justificatif (photo ou PDF, facultatif)",
    receiptHint: "PDF, PNG, JPEG ou WebP, 5 Mo maximum.",
    deleteOf: "Supprimer l'opération : {label}",
    deleteTitle: "Supprimer « {label} » ?",
    deleteText: "L'opération quitte le grand livre et les totaux. La suppression est notée dans le journal, avec le montant et le motif.",
    deleteReason: "Motif",
    deleteConfirm: "Supprimer",
    deleted: "Opération supprimée",
    linked: {
      dues: "Cette opération est le paiement d'une cotisation : annulez-la depuis la page Cotisations.",
      sponsor: "Cette opération est le paiement d'un sponsor : modifiez-la depuis la fiche du sponsor.",
      affiliation: "Cette opération vient d'une affiliation marquée en ordre : annulez-la depuis l'onglet Affiliations.",
    },
    linkedTitle: "Opération liée",
    open: "Ouvrir",
    yearApproved: "L'exercice de cette opération est approuvé par l'assemblée générale : elle ne peut plus être supprimée.",
    next30: "Échéances à 30 jours",
    next30Hint: "Cotisations attendues et dates d'argent à venir",
    last: "Dernières opérations",
    seeAll: "Voir toutes les opérations",
    cancel: "Annuler",
    statementsTitle: "Relevés de compte",
    statementsIntro:
      "Déposez chaque mois le relevé de votre banque (PDF ou CSV) comme justificatif. Le solde de fin de mois est comparé à la trésorerie de la plateforme à la même date. Le rapprochement ligne par ligne viendra avec le lot 09.",
    upload: "Déposer un relevé",
    account: "Compte (facultatif)",
    accountHint: "Par exemple « Compte courant » ou les derniers chiffres de l'IBAN.",
    month: "Mois",
    balance: "Solde de fin de mois (€, facultatif)",
    balanceHint: "Laissez vide pour un CSV : le solde est lu dans la colonne « Solde ».",
    file: "Fichier du relevé",
    fileHint: "PDF ou CSV, 5 Mo maximum.",
    closing: "Solde du relevé",
    platform: "Trésorerie de la plateforme",
    gap: "Écart",
    equal: "Égal",
    unknown: "Solde non indiqué",
    fromCsv: "lu dans le CSV",
    none: "Aucun relevé déposé.",
    removeOf: "Retirer le relevé {month} : {name}",
    removed: "Relevé retiré",
    uploaded: "Relevé déposé",
    lot09: "Rapprochement automatique : à venir (lot 09).",
  },
  nl: {
    add: "Een verrichting toevoegen",
    more: "Meer acties voor de financiën",
    export: "De verrichtingen exporteren",
    annualReport: "Jaarverslag",
    kind: "Soort verrichting",
    expense: "Uitgave",
    income: "Ontvangst",
    receipt: "Bewijsstuk (foto of PDF, optioneel)",
    receiptHint: "PDF, PNG, JPEG of WebP, maximaal 5 MB.",
    deleteOf: "De verrichting verwijderen: {label}",
    deleteTitle: "« {label} » verwijderen?",
    deleteText: "De verrichting verdwijnt uit het grootboek en de totalen. De verwijdering wordt in het logboek genoteerd, met het bedrag en de reden.",
    deleteReason: "Reden",
    deleteConfirm: "Verwijderen",
    deleted: "Verrichting verwijderd",
    linked: {
      dues: "Deze verrichting is de betaling van een lidgeld: annuleer ze via de pagina Lidgelden.",
      sponsor: "Deze verrichting is de betaling van een sponsor: wijzig ze via de fiche van de sponsor.",
      affiliation: "Deze verrichting komt van een aansluiting die in orde is gemarkeerd: annuleer ze via het tabblad Aansluitingen.",
    },
    linkedTitle: "Gekoppelde verrichting",
    open: "Openen",
    yearApproved: "Het boekjaar van deze verrichting is goedgekeurd door de algemene vergadering: ze kan niet meer verwijderd worden.",
    next30: "Vervaldagen binnen 30 dagen",
    next30Hint: "Verwachte lidgelden en komende geldafspraken",
    last: "Laatste verrichtingen",
    seeAll: "Alle verrichtingen bekijken",
    cancel: "Annuleren",
    statementsTitle: "Rekeningafschriften",
    statementsIntro:
      "Leg elke maand het afschrift van uw bank neer (PDF of CSV) als bewijsstuk. Het eindsaldo van de maand wordt vergeleken met de kas van het platform op dezelfde datum. De afstemming per regel komt met lot 09.",
    upload: "Een afschrift neerleggen",
    account: "Rekening (optioneel)",
    accountHint: "Bijvoorbeeld « Zichtrekening » of de laatste cijfers van de IBAN.",
    month: "Maand",
    balance: "Eindsaldo van de maand (€, optioneel)",
    balanceHint: "Leeg laten voor een CSV: het saldo wordt in de kolom « Saldo » gelezen.",
    file: "Bestand van het afschrift",
    fileHint: "PDF of CSV, maximaal 5 MB.",
    closing: "Saldo van het afschrift",
    platform: "Kas van het platform",
    gap: "Verschil",
    equal: "Gelijk",
    unknown: "Saldo niet opgegeven",
    fromCsv: "gelezen in de CSV",
    none: "Nog geen afschrift neergelegd.",
    removeOf: "Het afschrift {month} weghalen: {name}",
    removed: "Afschrift weggehaald",
    uploaded: "Afschrift neergelegd",
    lot09: "Automatische afstemming: komt later (lot 09).",
  },
  en: {
    add: "Add an operation",
    more: "More finance actions",
    export: "Export the operations",
    annualReport: "Annual report",
    kind: "Kind of operation",
    expense: "Expense",
    income: "Income",
    receipt: "Receipt (photo or PDF, optional)",
    receiptHint: "PDF, PNG, JPEG or WebP, 5 MB at most.",
    deleteOf: "Delete the operation: {label}",
    deleteTitle: "Delete « {label} »?",
    deleteText: "The operation leaves the ledger and the totals. The deletion is written in the log, with the amount and the reason.",
    deleteReason: "Reason",
    deleteConfirm: "Delete",
    deleted: "Operation deleted",
    linked: {
      dues: "This operation is a dues payment: cancel it from the Dues page.",
      sponsor: "This operation is a sponsor payment: change it from the sponsor's file.",
      affiliation: "This operation comes from an affiliation marked as settled: undo it from the Affiliations tab.",
    },
    linkedTitle: "Linked operation",
    open: "Open",
    yearApproved: "The financial year of this operation is approved by the general assembly: it can no longer be deleted.",
    next30: "Due within 30 days",
    next30Hint: "Expected dues and upcoming money dates",
    last: "Latest operations",
    seeAll: "See all operations",
    cancel: "Cancel",
    statementsTitle: "Bank statements",
    statementsIntro:
      "File your bank's statement every month (PDF or CSV) as proof. The month's closing balance is compared with the platform's cash on the same day. The line-by-line reconciliation comes with lot 09.",
    upload: "File a statement",
    account: "Account (optional)",
    accountHint: "For example « Current account » or the last digits of the IBAN.",
    month: "Month",
    balance: "Closing balance of the month (€, optional)",
    balanceHint: "Leave empty for a CSV: the balance is read in the « Balance » column.",
    file: "Statement file",
    fileHint: "PDF or CSV, 5 MB at most.",
    closing: "Statement balance",
    platform: "Platform cash",
    gap: "Gap",
    equal: "Equal",
    unknown: "Balance not given",
    fromCsv: "read in the CSV",
    none: "No statement filed yet.",
    removeOf: "Remove the statement {month}: {name}",
    removed: "Statement removed",
    uploaded: "Statement filed",
    lot09: "Automatic reconciliation: coming later (lot 09).",
  },
};
