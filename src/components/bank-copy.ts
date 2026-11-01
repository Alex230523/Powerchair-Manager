import type { Locale } from "@/lib/locale";

/** B1 (lot 09): the club's bank, statement import, reconciliation and the transfer QR. */
export type BankCopy = {
  title: string;
  intro: string;
  accounts: string;
  accountsIntro: string;
  noAccount: string;
  addAccount: string;
  editAccountOf: string;
  archiveOf: string;
  restoreOf: string;
  archived: string;
  edit: string;
  archive: string;
  restore: string;
  status: string;
  label: string;
  iban: string;
  bic: string;
  holder: string;
  holderHint: string;
  forDues: string;
  forDuesBadge: string;
  save: string;
  cancel: string;
  saved: string;
  import: string;
  importIntro: string;
  account: string;
  noAccountChoice: string;
  file: string;
  fileHint: string;
  formats: Record<"csv" | "xlsx" | "coda" | "camt", string>;
  banks: Record<"belfius" | "bnp" | "ing" | "kbc" | "other", string>;
  detected: string;
  unreadable: string;
  columns: string;
  columnsHint: string;
  col: Record<"date" | "amount" | "credit" | "debit" | "counterparty" | "counterpartyIban" | "communication" | "bankRef", string>;
  none: string;
  previewDo: string;
  preview: string;
  previewSummary: string;
  ignoredRows: string;
  state: Record<"new" | "duplicate" | "automatic", string>;
  importDo: string;
  imported: string;
  nothingNew: string;
  toReconcile: string;
  toReconcileIntro: string;
  allClear: string;
  date: string;
  amount: string;
  counterparty: string;
  communication: string;
  suggestions: string;
  reasons: Record<"reference" | "amount" | "name", string>;
  suggestionOf: string;
  allocate: string;
  allocateOf: string;
  ignore: string;
  ignoreOf: string;
  ignoredDone: string;
  unignore: string;
  left: string;
  parts: string;
  addPart: string;
  removePart: string;
  target: string;
  targets: Record<"receivable" | "credit" | "pot" | "partner" | "grant" | "other", string>;
  receivable: string;
  person: string;
  pot: string;
  partner: string;
  grant: string;
  category: string;
  remainingOf: string;
  surplus: string;
  tooMuch: string;
  allocated: string;
  done: string;
  doneIntro: string;
  automatic: string;
  ignoredState: string;
  cancelAllocation: string;
  cancelAllocationOf: string;
  reason: string;
  reasonHint: string;
  cancelled: string;
  credits: string;
  creditsIntro: string;
  noCredit: string;
  applyCredit: string;
  applyCreditOf: string;
  refund: string;
  refundOf: string;
  refundDate: string;
  applied: string;
  refunded: string;
  history: string;
  historyLine: string;
  restricted: string;
  loading: string;
  errors: Record<string, string>;
  /* The transfer QR (parents, e-mail, print). */
  pay: string;
  payIntro: string;
  qrAlt: string;
  qrWarning: string;
  beneficiary: string;
  reference: string;
  toPay: string;
  print: string;
  printTitle: string;
  noDuesAccount: string;
  copy: string;
  copied: string;
};

export const bankCopy: Record<Locale, BankCopy> = {
  fr: {
    title: "Banque et rapprochement",
    intro: "Importez le relevé de la banque : chaque virement avec la bonne communication structurée se range tout seul, le reste vous est proposé.",
    accounts: "Comptes bancaires",
    accountsIntro: "Le compte des cotisations est celui que voient les familles, dans le QR de virement et dans l'e-mail.",
    noAccount: "Aucun compte encore : ajoutez celui du club pour afficher le QR de virement aux familles.",
    addAccount: "Ajouter un compte",
    editAccountOf: "Modifier le compte {name}",
    archiveOf: "Archiver le compte {name}",
    restoreOf: "Réactiver le compte {name}",
    archived: "Archivé",
    edit: "Modifier",
    archive: "Archiver",
    restore: "Réactiver",
    status: "État",
    label: "Nom du compte",
    iban: "IBAN",
    bic: "BIC (facultatif)",
    holder: "Titulaire",
    holderHint: "Le nom affiché dans l'application bancaire. Vide : le nom du club.",
    forDues: "Compte des cotisations",
    forDuesBadge: "Cotisations",
    save: "Enregistrer",
    cancel: "Annuler",
    saved: "Enregistré.",
    import: "Importer un relevé",
    importIntro: "CSV ou Excel de Belfius, BNP Paribas Fortis, ING ou KBC, CODA ou camt.053. Le fichier est lu sur cet appareil : rien n'est enregistré avant l'aperçu.",
    account: "Compte",
    noAccountChoice: "Sans compte précis",
    file: "Fichier du relevé",
    fileHint: "Formats : .csv, .xlsx, .cod, .xml. Réimporter le même relevé ne crée aucune ligne en double.",
    formats: { csv: "CSV", xlsx: "Excel", coda: "CODA", camt: "camt.053" },
    banks: { belfius: "Belfius", bnp: "BNP Paribas Fortis", ing: "ING", kbc: "KBC", other: "Autre banque" },
    detected: "Format {format}, {bank} : {n} ligne(s) lue(s).",
    unreadable: "Ce fichier n'a pas pu être lu. Vérifiez qu'il s'agit bien d'un relevé.",
    columns: "Colonnes du fichier",
    columnsHint: "Reconnues d'après les en-têtes et retenues pour cette banque au prochain import.",
    col: {
      date: "Date",
      amount: "Montant",
      credit: "Crédit (entrées)",
      debit: "Débit (sorties)",
      counterparty: "Contrepartie",
      counterpartyIban: "Compte de la contrepartie",
      communication: "Communication",
      bankRef: "Référence de la banque",
    },
    none: "Aucune",
    previewDo: "Voir l'aperçu",
    preview: "Aperçu",
    previewSummary: "{n} nouvelle(s) ligne(s), {d} déjà importée(s), {a} se rangeront toutes seules.",
    ignoredRows: "{n} ligne(s) sans date ou sans montant ont été laissées de côté.",
    state: { new: "Nouvelle", duplicate: "Déjà importée", automatic: "Rangée toute seule" },
    importDo: "Importer",
    imported: "{c} ligne(s) importée(s), {m} rapprochée(s) toute(s) seule(s), {d} doublon(s) ignoré(s).",
    nothingNew: "Rien de nouveau : toutes les lignes de ce relevé sont déjà importées.",
    toReconcile: "À rapprocher",
    toReconcileIntro: "Les virements que l'application n'a pas pu ranger seule. Les propositions sont classées : vérifiez avant de confirmer.",
    allClear: "Tout est rapproché.",
    date: "Date",
    amount: "Montant",
    counterparty: "Contrepartie",
    communication: "Communication",
    suggestions: "Propositions",
    reasons: { reference: "communication", amount: "montant", name: "nom" },
    suggestionOf: "Affecter à {name} (reste {left})",
    allocate: "Affecter…",
    allocateOf: "Affecter le mouvement du {date} de {amount}",
    ignore: "Ignorer",
    ignoreOf: "Ignorer le mouvement du {date} de {amount}",
    ignoredDone: "Mouvement ignoré.",
    unignore: "Ne plus ignorer",
    left: "Reste à répartir : {amount}",
    parts: "Répartition",
    addPart: "Ajouter une part",
    removePart: "Retirer la part {n}",
    target: "Affecter à",
    targets: { receivable: "Une cotisation", credit: "Un crédit pour la famille", pot: "Une cagnotte", partner: "Un sponsor", grant: "Une tranche de subside", other: "Autre recette ou dépense" },
    receivable: "Cotisation",
    person: "Personne",
    pot: "Cagnotte",
    partner: "Sponsor",
    grant: "Subside",
    category: "Catégorie",
    remainingOf: "{name} · {category} · {season} (reste {left})",
    surplus: "Le surplus de {amount} ira en crédit pour {name}.",
    tooMuch: "La répartition dépasse le mouvement de {amount}.",
    allocated: "Mouvement rapproché.",
    done: "Rapprochés et ignorés",
    doneIntro: "Annuler un rapprochement demande un motif ; l'écriture des finances est annulée avec lui.",
    automatic: "tout seul",
    ignoredState: "Ignoré",
    cancelAllocation: "Annuler",
    cancelAllocationOf: "Annuler le rapprochement {name} de {amount}",
    reason: "Motif",
    reasonHint: "Au moins 5 caractères ; il reste dans l'historique.",
    cancelled: "Rapprochement annulé.",
    credits: "Crédits des familles",
    creditsIntro: "Un trop-perçu reste au crédit de la famille : il sert à une prochaine cotisation ou se rembourse.",
    noCredit: "Aucun crédit en cours.",
    applyCredit: "Utiliser",
    applyCreditOf: "Utiliser le crédit de {name}",
    refund: "Rembourser",
    refundOf: "Rembourser le crédit de {name}",
    refundDate: "Date du remboursement",
    applied: "Crédit utilisé.",
    refunded: "Remboursement enregistré.",
    history: "Derniers imports",
    historyLine: "{date} · {file} · {c} nouvelle(s), {m} rangée(s) seule(s)",
    restricted: "Le rapprochement bancaire est réservé au droit argent (cotisations).",
    loading: "Chargement…",
    errors: {
      DUPLICATE: "Ce mouvement est déjà importé.",
      INVALID_TRANSITION: "Cette action n'est plus possible sur ce mouvement : rechargez la page.",
      INVALID_DATE: "La date du remboursement ne peut pas être dans le futur.",
      TOO_LARGE: "Ce relevé est trop grand : importez-le en plusieurs fois (5000 lignes au plus).",
    },
    pay: "Payer par virement",
    payIntro: "Scannez ce QR avec l'application de votre banque : le montant, le compte et la communication structurée se remplissent tout seuls.",
    qrAlt: "QR de virement de {amount} vers {name}",
    qrWarning: "Le QR prépare le virement, il ne confirme pas le paiement. La cotisation passe en « payée » quand le trésorier a rapproché le relevé.",
    beneficiary: "Bénéficiaire",
    reference: "Communication structurée",
    toPay: "Montant",
    print: "Imprimer",
    printTitle: "Invitation à payer · {name}",
    noDuesAccount: "Le club n'a pas encore indiqué son compte bancaire : le QR de virement n'est pas disponible.",
    copy: "Copier la communication",
    copied: "Communication copiée.",
  },
  nl: {
    title: "Bank en afstemming",
    intro: "Importeer het rekeningafschrift: elke overschrijving met de juiste gestructureerde mededeling wordt vanzelf geboekt, de rest wordt u voorgesteld.",
    accounts: "Bankrekeningen",
    accountsIntro: "De rekening voor lidgelden is die welke de gezinnen zien, in de overschrijvings-QR en in de e-mail.",
    noAccount: "Nog geen rekening: voeg die van de club toe om de overschrijvings-QR aan de gezinnen te tonen.",
    addAccount: "Rekening toevoegen",
    editAccountOf: "Rekening {name} wijzigen",
    archiveOf: "Rekening {name} archiveren",
    restoreOf: "Rekening {name} opnieuw activeren",
    archived: "Gearchiveerd",
    edit: "Wijzigen",
    archive: "Archiveren",
    restore: "Heractiveren",
    status: "Status",
    label: "Naam van de rekening",
    iban: "IBAN",
    bic: "BIC (facultatief)",
    holder: "Houder",
    holderHint: "De naam in de bankapp. Leeg: de naam van de club.",
    forDues: "Rekening voor lidgelden",
    forDuesBadge: "Lidgelden",
    save: "Opslaan",
    cancel: "Annuleren",
    saved: "Opgeslagen.",
    import: "Afschrift importeren",
    importIntro: "CSV of Excel van Belfius, BNP Paribas Fortis, ING of KBC, CODA of camt.053. Het bestand wordt op dit toestel gelezen: niets wordt bewaard vóór de voorvertoning.",
    account: "Rekening",
    noAccountChoice: "Zonder bepaalde rekening",
    file: "Bestand van het afschrift",
    fileHint: "Formaten: .csv, .xlsx, .cod, .xml. Hetzelfde afschrift opnieuw importeren maakt geen dubbele lijnen.",
    formats: { csv: "CSV", xlsx: "Excel", coda: "CODA", camt: "camt.053" },
    banks: { belfius: "Belfius", bnp: "BNP Paribas Fortis", ing: "ING", kbc: "KBC", other: "Andere bank" },
    detected: "Formaat {format}, {bank}: {n} lijn(en) gelezen.",
    unreadable: "Dit bestand kon niet gelezen worden. Controleer of het een afschrift is.",
    columns: "Kolommen van het bestand",
    columnsHint: "Herkend aan de hoofdingen en onthouden voor deze bank bij de volgende import.",
    col: {
      date: "Datum",
      amount: "Bedrag",
      credit: "Credit (ontvangsten)",
      debit: "Debet (uitgaven)",
      counterparty: "Tegenpartij",
      counterpartyIban: "Rekening van de tegenpartij",
      communication: "Mededeling",
      bankRef: "Referentie van de bank",
    },
    none: "Geen",
    previewDo: "Voorvertoning",
    preview: "Voorvertoning",
    previewSummary: "{n} nieuwe lijn(en), {d} al geïmporteerd, {a} worden vanzelf geboekt.",
    ignoredRows: "{n} lijn(en) zonder datum of bedrag werden overgeslagen.",
    state: { new: "Nieuw", duplicate: "Al geïmporteerd", automatic: "Vanzelf geboekt" },
    importDo: "Importeren",
    imported: "{c} lijn(en) geïmporteerd, {m} vanzelf afgestemd, {d} dubbele genegeerd.",
    nothingNew: "Niets nieuws: alle lijnen van dit afschrift zijn al geïmporteerd.",
    toReconcile: "Af te stemmen",
    toReconcileIntro: "De overschrijvingen die de toepassing niet zelf kon boeken. De voorstellen zijn gerangschikt: controleer vóór u bevestigt.",
    allClear: "Alles is afgestemd.",
    date: "Datum",
    amount: "Bedrag",
    counterparty: "Tegenpartij",
    communication: "Mededeling",
    suggestions: "Voorstellen",
    reasons: { reference: "mededeling", amount: "bedrag", name: "naam" },
    suggestionOf: "Toewijzen aan {name} (rest {left})",
    allocate: "Toewijzen…",
    allocateOf: "De beweging van {date} van {amount} toewijzen",
    ignore: "Negeren",
    ignoreOf: "De beweging van {date} van {amount} negeren",
    ignoredDone: "Beweging genegeerd.",
    unignore: "Niet meer negeren",
    left: "Nog te verdelen: {amount}",
    parts: "Verdeling",
    addPart: "Deel toevoegen",
    removePart: "Deel {n} verwijderen",
    target: "Toewijzen aan",
    targets: { receivable: "Een lidgeld", credit: "Een tegoed voor het gezin", pot: "Een pot", partner: "Een sponsor", grant: "Een subsidieschijf", other: "Andere ontvangst of uitgave" },
    receivable: "Lidgeld",
    person: "Persoon",
    pot: "Pot",
    partner: "Sponsor",
    grant: "Subsidie",
    category: "Categorie",
    remainingOf: "{name} · {category} · {season} (rest {left})",
    surplus: "Het overschot van {amount} gaat als tegoed naar {name}.",
    tooMuch: "De verdeling is hoger dan de beweging van {amount}.",
    allocated: "Beweging afgestemd.",
    done: "Afgestemd en genegeerd",
    doneIntro: "Een afstemming annuleren vraagt een reden; de boeking in de financiën wordt mee geannuleerd.",
    automatic: "vanzelf",
    ignoredState: "Genegeerd",
    cancelAllocation: "Annuleren",
    cancelAllocationOf: "De afstemming {name} van {amount} annuleren",
    reason: "Reden",
    reasonHint: "Minstens 5 tekens; ze blijft in de geschiedenis.",
    cancelled: "Afstemming geannuleerd.",
    credits: "Tegoeden van de gezinnen",
    creditsIntro: "Een te veel betaald bedrag blijft als tegoed van het gezin: het dient voor een volgend lidgeld of wordt terugbetaald.",
    noCredit: "Geen lopend tegoed.",
    applyCredit: "Gebruiken",
    applyCreditOf: "Het tegoed van {name} gebruiken",
    refund: "Terugbetalen",
    refundOf: "Het tegoed van {name} terugbetalen",
    refundDate: "Datum van de terugbetaling",
    applied: "Tegoed gebruikt.",
    refunded: "Terugbetaling geregistreerd.",
    history: "Laatste imports",
    historyLine: "{date} · {file} · {c} nieuw, {m} vanzelf geboekt",
    restricted: "De bankafstemming is voorbehouden aan het geldrecht (lidgelden).",
    loading: "Laden…",
    errors: {
      DUPLICATE: "Deze beweging is al geïmporteerd.",
      INVALID_TRANSITION: "Deze actie kan niet meer op deze beweging: herlaad de pagina.",
      INVALID_DATE: "De datum van de terugbetaling kan niet in de toekomst liggen.",
      TOO_LARGE: "Dit afschrift is te groot: importeer het in delen (hoogstens 5000 lijnen).",
    },
    pay: "Betalen per overschrijving",
    payIntro: "Scan deze QR met de app van uw bank: bedrag, rekening en gestructureerde mededeling worden vanzelf ingevuld.",
    qrAlt: "Overschrijvings-QR van {amount} naar {name}",
    qrWarning: "De QR bereidt de overschrijving voor, hij bevestigt de betaling niet. Het lidgeld staat op « betaald » zodra de penningmeester het afschrift heeft afgestemd.",
    beneficiary: "Begunstigde",
    reference: "Gestructureerde mededeling",
    toPay: "Bedrag",
    print: "Afdrukken",
    printTitle: "Betalingsuitnodiging · {name}",
    noDuesAccount: "De club heeft zijn bankrekening nog niet opgegeven: de overschrijvings-QR is niet beschikbaar.",
    copy: "Mededeling kopiëren",
    copied: "Mededeling gekopieerd.",
  },
  en: {
    title: "Bank and reconciliation",
    intro: "Import the bank statement: each transfer with the right structured communication files itself, the rest is suggested to you.",
    accounts: "Bank accounts",
    accountsIntro: "The dues account is the one families see, in the transfer QR and in the e-mail.",
    noAccount: "No account yet: add the club's to show families the transfer QR.",
    addAccount: "Add an account",
    editAccountOf: "Edit the account {name}",
    archiveOf: "Archive the account {name}",
    restoreOf: "Restore the account {name}",
    archived: "Archived",
    edit: "Edit",
    archive: "Archive",
    restore: "Restore",
    status: "Status",
    label: "Account name",
    iban: "IBAN",
    bic: "BIC (optional)",
    holder: "Holder",
    holderHint: "The name shown in the banking app. Empty: the club's name.",
    forDues: "Dues account",
    forDuesBadge: "Dues",
    save: "Save",
    cancel: "Cancel",
    saved: "Saved.",
    import: "Import a statement",
    importIntro: "CSV or Excel from Belfius, BNP Paribas Fortis, ING or KBC, CODA or camt.053. The file is read on this device: nothing is saved before the preview.",
    account: "Account",
    noAccountChoice: "No specific account",
    file: "Statement file",
    fileHint: "Formats: .csv, .xlsx, .cod, .xml. Importing the same statement again creates no duplicate line.",
    formats: { csv: "CSV", xlsx: "Excel", coda: "CODA", camt: "camt.053" },
    banks: { belfius: "Belfius", bnp: "BNP Paribas Fortis", ing: "ING", kbc: "KBC", other: "Other bank" },
    detected: "{format} format, {bank}: {n} line(s) read.",
    unreadable: "This file could not be read. Check that it is a statement.",
    columns: "Columns of the file",
    columnsHint: "Recognised from the headers and remembered for this bank at the next import.",
    col: {
      date: "Date",
      amount: "Amount",
      credit: "Credit (money in)",
      debit: "Debit (money out)",
      counterparty: "Counterparty",
      counterpartyIban: "Counterparty account",
      communication: "Communication",
      bankRef: "Bank reference",
    },
    none: "None",
    previewDo: "Show the preview",
    preview: "Preview",
    previewSummary: "{n} new line(s), {d} already imported, {a} will file themselves.",
    ignoredRows: "{n} line(s) without a date or an amount were left aside.",
    state: { new: "New", duplicate: "Already imported", automatic: "Files itself" },
    importDo: "Import",
    imported: "{c} line(s) imported, {m} reconciled by themselves, {d} duplicate(s) skipped.",
    nothingNew: "Nothing new: every line of this statement is already imported.",
    toReconcile: "To reconcile",
    toReconcileIntro: "The transfers the application could not file by itself. Suggestions are ranked: check before confirming.",
    allClear: "Everything is reconciled.",
    date: "Date",
    amount: "Amount",
    counterparty: "Counterparty",
    communication: "Communication",
    suggestions: "Suggestions",
    reasons: { reference: "communication", amount: "amount", name: "name" },
    suggestionOf: "Allocate to {name} ({left} left)",
    allocate: "Allocate…",
    allocateOf: "Allocate the movement of {date} of {amount}",
    ignore: "Ignore",
    ignoreOf: "Ignore the movement of {date} of {amount}",
    ignoredDone: "Movement ignored.",
    unignore: "Stop ignoring",
    left: "Left to allocate: {amount}",
    parts: "Split",
    addPart: "Add a part",
    removePart: "Remove part {n}",
    target: "Allocate to",
    targets: { receivable: "A membership fee", credit: "A credit for the family", pot: "A fundraising pot", partner: "A sponsor", grant: "A grant instalment", other: "Other income or expense" },
    receivable: "Membership fee",
    person: "Person",
    pot: "Pot",
    partner: "Sponsor",
    grant: "Grant",
    category: "Category",
    remainingOf: "{name} · {category} · {season} ({left} left)",
    surplus: "The surplus of {amount} goes to a credit for {name}.",
    tooMuch: "The split is more than the movement of {amount}.",
    allocated: "Movement reconciled.",
    done: "Reconciled and ignored",
    doneIntro: "Cancelling a reconciliation asks for a reason; the finance entry is cancelled with it.",
    automatic: "by itself",
    ignoredState: "Ignored",
    cancelAllocation: "Cancel",
    cancelAllocationOf: "Cancel the reconciliation {name} of {amount}",
    reason: "Reason",
    reasonHint: "At least 5 characters; it stays in the history.",
    cancelled: "Reconciliation cancelled.",
    credits: "Family credits",
    creditsIntro: "An overpayment stays as the family's credit: it pays a next fee or is refunded.",
    noCredit: "No credit outstanding.",
    applyCredit: "Use",
    applyCreditOf: "Use the credit of {name}",
    refund: "Refund",
    refundOf: "Refund the credit of {name}",
    refundDate: "Refund date",
    applied: "Credit used.",
    refunded: "Refund recorded.",
    history: "Latest imports",
    historyLine: "{date} · {file} · {c} new, {m} filed by themselves",
    restricted: "Bank reconciliation is reserved to the money right (dues).",
    loading: "Loading…",
    errors: {
      DUPLICATE: "This movement is already imported.",
      INVALID_TRANSITION: "This action is no longer possible on this movement: reload the page.",
      INVALID_DATE: "The refund date cannot be in the future.",
      TOO_LARGE: "This statement is too large: import it in several parts (5000 lines at most).",
    },
    pay: "Pay by bank transfer",
    payIntro: "Scan this QR with your banking app: the amount, the account and the structured communication fill in by themselves.",
    qrAlt: "Transfer QR of {amount} to {name}",
    qrWarning: "The QR prepares the transfer, it does not confirm the payment. The fee shows as « paid » once the treasurer has reconciled the statement.",
    beneficiary: "Beneficiary",
    reference: "Structured communication",
    toPay: "Amount",
    print: "Print",
    printTitle: "Payment request · {name}",
    noDuesAccount: "The club has not given its bank account yet: the transfer QR is not available.",
    copy: "Copy the communication",
    copied: "Communication copied.",
  },
};
