import type { Locale } from "@/lib/locale";

/** B8: tax receipts for gifts (281.71), Belcotax-on-Web, the approval and the donor's form. */
export type TaxCopy = {
  title: string;
  intro: string;
  approvalTitle: string;
  approvalIntro: string;
  approvalQuestion: string;
  yes: string;
  no: string;
  approvalNumber: string;
  approvalFrom: string;
  approvalTo: string;
  threshold: string;
  thresholdHint: string;
  approvalRequired: string;
  save: string;
  saved: string;
  offHint: string;
  alertEnding: string;
  alertEnded: string;
  year: string;
  deadline: string;
  deadlineHint: string;
  donors: string;
  donorsIntro: string;
  addDonor: string;
  editDonorOf: string;
  edit: string;
  noDonor: string;
  kind: string;
  kinds: { person: string; company: string };
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  companyNumber: string;
  contact: string;
  noContact: string;
  national: string;
  nationalSet: string;
  nationalMissing: string;
  nationalOf: string;
  nationalHint: string;
  reveal: string;
  revealOf: string;
  request: string;
  requestOf: string;
  requested: string;
  requestPending: string;
  total: string;
  purged: string;
  gifts: string;
  giftsIntro: string;
  addGift: string;
  noGift: string;
  date: string;
  amount: string;
  nature: string;
  natures: { gift: string; in_kind: string; purchase: string; sponsor: string; dues: string };
  natureHint: string;
  note: string;
  cancelGift: string;
  cancelGiftOf: string;
  reason: string;
  reasonHint: string;
  cancelled: string;
  candidates: string;
  candidatesIntro: string;
  qualify: string;
  qualifyOf: string;
  sources: { ledger: string; pot: string };
  donor: string;
  chooseDonor: string;
  report: string;
  reportIntro: string;
  eligible: string;
  below: string;
  missing: string;
  duplicates: string;
  none: string;
  receipts: string;
  receiptsIntro: string;
  issue: string;
  issued: string;
  noReceipt: string;
  number: string;
  status: string;
  statuses: { issued: string; corrected: string; cancelled: string };
  correction: string;
  pdf: string;
  pdfOf: string;
  correct: string;
  correctOf: string;
  cancelReceipt: string;
  cancelReceiptOf: string;
  send: string;
  sent: string;
  emailed: string;
  belcotax: string;
  belcotaxIntro: string;
  check: string;
  export: string;
  checkOk: string;
  issues: Record<"SENDER" | "IDENTIFIER" | "AMOUNT" | "SEQUENCE" | "ADDRESS" | "COUNTRY" | "TOTALS", string>;
  nationalTolerance: string;
  rights: string;
  rightsIntro: string;
  rightOf: string;
  noOne: string;
  cancel: string;
  loading: string;
  errors: Record<string, string>;
  /* The donor's public form. */
  donorTitle: string;
  donorIntro: string;
  donorField: string;
  donorHint: string;
  donorSend: string;
  donorDone: string;
  donorGone: string;
};

export const taxCopy: Record<Locale, TaxCopy> = {
  fr: {
    title: "Attestations fiscales",
    intro: "Les dons sans contrepartie reçus dans l'année, l'attestation 281.71 de chaque donateur au-dessus du seuil et le fichier pour Belcotax-on-Web.",
    approvalTitle: "Attestations fiscales",
    approvalIntro: "Seule une ASBL agréée par le SPF Finances peut délivrer des attestations fiscales pour dons. Un club sportif ne l'est pas d'office.",
    approvalQuestion: "Notre ASBL est agréée pour délivrer des attestations fiscales",
    yes: "Oui",
    no: "Non",
    approvalNumber: "Numéro d'agrément",
    approvalFrom: "Agréée du",
    approvalTo: "Agréée jusqu'au",
    threshold: "Seuil légal par donateur et par an (€)",
    thresholdHint: "40 € aujourd'hui ; à adapter si la loi change.",
    approvalRequired: "Sur « oui », le numéro et la période d'agrément sont obligatoires.",
    save: "Enregistrer",
    saved: "Enregistré.",
    offHint: "Sur « non », rien n'apparaît au sujet des attestations ; l'historique est gardé.",
    alertEnding: "L'agrément se termine le {date} : pensez à le faire renouveler.",
    alertEnded: "L'agrément a pris fin le {date} : aucune attestation ne peut couvrir des dons reçus après cette date.",
    year: "Année des dons",
    deadline: "Dépôt Belcotax-on-Web au plus tard le {date}",
    deadlineHint: "Date habituelle (fin février) ; vérifiez celle de l'année sur le site du SPF Finances.",
    donors: "Donateurs",
    donorsIntro: "Une personne (numéro de registre national) ou une entreprise (numéro BCE).",
    addDonor: "Ajouter un donateur",
    editDonorOf: "Modifier le donateur {name}",
    edit: "Modifier",
    noDonor: "Aucun donateur encore.",
    kind: "Type",
    kinds: { person: "Personne", company: "Entreprise" },
    name: "Nom",
    street: "Rue et numéro",
    postalCode: "Code postal",
    city: "Commune",
    country: "Pays (code ISO)",
    email: "Adresse e-mail",
    companyNumber: "Numéro d'entreprise (BCE)",
    contact: "Fiche du carnet d'adresses",
    noContact: "Aucune",
    national: "Numéro national",
    nationalSet: "Connu",
    nationalMissing: "Manquant",
    nationalOf: "Numéro national de {name}",
    nationalHint: "11 chiffres. Il sert uniquement à Belcotax et n'est jamais demandé dans la communication d'un virement.",
    reveal: "Afficher",
    revealOf: "Afficher le numéro national de {name}",
    request: "Demander au donateur",
    requestOf: "Envoyer à {name} le formulaire sécurisé pour son numéro national",
    requested: "Formulaire envoyé au donateur.",
    requestPending: "Demande envoyée",
    total: "Dons de l'année",
    purged: "Données effacées (10 ans après le dernier don)",
    gifts: "Dons",
    giftsIntro: "Seuls les dons sans contrepartie comptent : jamais une cotisation, du sponsoring, un achat (souper, vente) ni un don en nature.",
    addGift: "Ajouter un don",
    noGift: "Aucun don cette année.",
    date: "Date",
    amount: "Montant (€)",
    nature: "Nature",
    natures: { gift: "Don sans contrepartie", in_kind: "Don en nature (ne compte pas)", purchase: "Achat, souper, vente (ne compte pas)", sponsor: "Sponsoring (ne compte pas)", dues: "Cotisation (ne compte pas)" },
    natureHint: "Seul un don en argent sans contrepartie ouvre droit à l'attestation.",
    note: "Note",
    cancelGift: "Annuler",
    cancelGiftOf: "Annuler le don de {name} du {date}",
    reason: "Motif",
    reasonHint: "Au moins 5 caractères ; il reste dans l'historique.",
    cancelled: "Annulé.",
    candidates: "À qualifier",
    candidatesIntro: "Les dons enregistrés dans les finances ou les cagnottes de l'année, pas encore rattachés à un donateur.",
    qualify: "Rattacher",
    qualifyOf: "Rattacher {name} du {date} à un donateur",
    sources: { ledger: "Finances", pot: "Cagnotte" },
    donor: "Donateur",
    chooseDonor: "Choisir un donateur",
    report: "Rapport de contrôle",
    reportIntro: "À regarder avant d'émettre les attestations et d'exporter le fichier.",
    eligible: "Attestation prévue",
    below: "Sous le seuil",
    missing: "Sans numéro national ou BCE",
    duplicates: "Doublons probables",
    none: "Aucun",
    receipts: "Attestations",
    receiptsIntro: "Une par donateur et par an au-dessus du seuil. Une correction garde le numéro et remplace l'attestation ; une annulation demande un motif.",
    issue: "Émettre les attestations de l'année",
    issued: "{n} attestation(s) émise(s).",
    noReceipt: "Aucune attestation pour cette année.",
    number: "N°",
    status: "État",
    statuses: { issued: "Émise", corrected: "Remplacée", cancelled: "Annulée" },
    correction: "rectificative",
    pdf: "PDF",
    pdfOf: "Ouvrir l'attestation {n} de {name} en PDF",
    correct: "Corriger",
    correctOf: "Corriger l'attestation {n} de {name} d'après les dons actuels",
    cancelReceipt: "Annuler",
    cancelReceiptOf: "Annuler l'attestation {n} de {name}",
    send: "Envoyer par e-mail",
    sent: "{n} attestation(s) envoyée(s) par un lien privé.",
    emailed: "envoyée",
    belcotax: "Belcotax-on-Web",
    belcotaxIntro: "Le fichier XML des fiches 281.71 de l'année, vérifié avant l'export. Il contient les numéros nationaux : chaque export est noté au journal.",
    check: "Vérifier le fichier",
    export: "Télécharger le fichier XML",
    checkOk: "Aucun problème trouvé dans le fichier.",
    issues: {
      SENDER: "Le numéro BCE ou l'adresse du club manque (Réglages › Club).",
      IDENTIFIER: "Fiche {n} : numéro national ou BCE manquant ou incorrect.",
      AMOUNT: "Fiche {n} : montant invalide.",
      SEQUENCE: "Fiche {n} : numéro en double.",
      ADDRESS: "Fiche {n} : adresse incomplète.",
      COUNTRY: "Fiche {n} : donateur hors de Belgique, à vérifier dans Belcotax.",
      TOTALS: "Les totaux de contrôle ne correspondent pas.",
    },
    nationalTolerance: "Le numéro national est obligatoire depuis les dons de 2024, avec une tolérance pour 2024 et 2025 ; pour 2026, la règle reste à confirmer.",
    rights: "Accès aux numéros nationaux",
    rightsIntro: "La présidence y a toujours accès. Chaque ouverture est notée au journal.",
    rightOf: "{name} peut voir les numéros nationaux",
    noOne: "Personne d'autre que la présidence.",
    cancel: "Fermer",
    loading: "Chargement…",
    errors: {
      TAX_NOT_APPROVED: "Les attestations fiscales ne sont pas activées pour ce club.",
      TAX_APPROVAL_REQUIRED: "Indiquez le numéro et la période d'agrément.",
      INVALID_NATIONAL_NUMBER: "Ce numéro national n'est pas valide : vérifiez les 11 chiffres.",
      INVALID_COMPANY_NUMBER: "Ce numéro d'entreprise n'est pas valide : vérifiez les 10 chiffres.",
      BELCOTAX_INVALID: "Le fichier a des problèmes bloquants : corrigez-les d'abord (bouton « Vérifier le fichier »).",
      INVALID_DATE: "Les attestations s'émettent pour une année commencée.",
    },
    donorTitle: "Votre numéro national pour l'attestation fiscale",
    donorIntro: "{organization} vous remercie pour votre don. La loi demande votre numéro de registre national pour l'attestation fiscale : il est chiffré, sert uniquement à la déclaration Belcotax et est effacé dix ans après votre dernier don.",
    donorField: "Numéro de registre national",
    donorHint: "11 chiffres, au dos de votre carte d'identité.",
    donorSend: "Envoyer",
    donorDone: "Merci, votre numéro est enregistré. Vous pouvez fermer cette page.",
    donorGone: "Ce lien n'est plus valable. Demandez-en un nouveau au club.",
  },
  nl: {
    title: "Fiscale attesten",
    intro: "De giften zonder tegenprestatie van het jaar, het attest 281.71 van elke schenker boven de drempel en het bestand voor Belcotax-on-Web.",
    approvalTitle: "Fiscale attesten",
    approvalIntro: "Alleen een vzw erkend door de FOD Financiën mag fiscale attesten voor giften uitreiken. Een sportclub is dat niet vanzelf.",
    approvalQuestion: "Onze vzw is erkend om fiscale attesten uit te reiken",
    yes: "Ja",
    no: "Nee",
    approvalNumber: "Erkenningsnummer",
    approvalFrom: "Erkend vanaf",
    approvalTo: "Erkend tot",
    threshold: "Wettelijke drempel per schenker en per jaar (€)",
    thresholdHint: "Vandaag 40 €; aan te passen als de wet verandert.",
    approvalRequired: "Bij « ja » zijn het nummer en de periode van erkenning verplicht.",
    save: "Opslaan",
    saved: "Opgeslagen.",
    offHint: "Bij « nee » verschijnt niets over de attesten; de geschiedenis blijft bewaard.",
    alertEnding: "De erkenning eindigt op {date}: denk aan de vernieuwing.",
    alertEnded: "De erkenning is geëindigd op {date}: geen attest kan giften na die datum dekken.",
    year: "Jaar van de giften",
    deadline: "Indienen via Belcotax-on-Web uiterlijk op {date}",
    deadlineHint: "Gebruikelijke datum (eind februari); controleer die van het jaar op de site van de FOD Financiën.",
    donors: "Schenkers",
    donorsIntro: "Een persoon (rijksregisternummer) of een onderneming (KBO-nummer).",
    addDonor: "Schenker toevoegen",
    editDonorOf: "Schenker {name} wijzigen",
    edit: "Wijzigen",
    noDonor: "Nog geen schenker.",
    kind: "Soort",
    kinds: { person: "Persoon", company: "Onderneming" },
    name: "Naam",
    street: "Straat en nummer",
    postalCode: "Postcode",
    city: "Gemeente",
    country: "Land (ISO-code)",
    email: "E-mailadres",
    companyNumber: "Ondernemingsnummer (KBO)",
    contact: "Fiche in het adresboek",
    noContact: "Geen",
    national: "Rijksregisternummer",
    nationalSet: "Gekend",
    nationalMissing: "Ontbreekt",
    nationalOf: "Rijksregisternummer van {name}",
    nationalHint: "11 cijfers. Het dient alleen voor Belcotax en wordt nooit gevraagd in de mededeling van een overschrijving.",
    reveal: "Tonen",
    revealOf: "Het rijksregisternummer van {name} tonen",
    request: "Aan de schenker vragen",
    requestOf: "{name} het beveiligde formulier voor het rijksregisternummer sturen",
    requested: "Formulier naar de schenker gestuurd.",
    requestPending: "Aanvraag verstuurd",
    total: "Giften van het jaar",
    purged: "Gegevens gewist (10 jaar na de laatste gift)",
    gifts: "Giften",
    giftsIntro: "Alleen giften zonder tegenprestatie tellen: nooit een lidgeld, sponsoring, een aankoop (etentje, verkoop) of een gift in natura.",
    addGift: "Gift toevoegen",
    noGift: "Geen gift dit jaar.",
    date: "Datum",
    amount: "Bedrag (€)",
    nature: "Aard",
    natures: { gift: "Gift zonder tegenprestatie", in_kind: "Gift in natura (telt niet)", purchase: "Aankoop, etentje, verkoop (telt niet)", sponsor: "Sponsoring (telt niet)", dues: "Lidgeld (telt niet)" },
    natureHint: "Alleen een gift in geld zonder tegenprestatie geeft recht op het attest.",
    note: "Notitie",
    cancelGift: "Annuleren",
    cancelGiftOf: "De gift van {name} van {date} annuleren",
    reason: "Reden",
    reasonHint: "Minstens 5 tekens; ze blijft in de geschiedenis.",
    cancelled: "Geannuleerd.",
    candidates: "Te kwalificeren",
    candidatesIntro: "De giften van het jaar in de financiën of de potten, nog niet aan een schenker gekoppeld.",
    qualify: "Koppelen",
    qualifyOf: "{name} van {date} aan een schenker koppelen",
    sources: { ledger: "Financiën", pot: "Pot" },
    donor: "Schenker",
    chooseDonor: "Een schenker kiezen",
    report: "Controleverslag",
    reportIntro: "Na te kijken vóór de attesten uitgereikt worden en het bestand geëxporteerd wordt.",
    eligible: "Attest voorzien",
    below: "Onder de drempel",
    missing: "Zonder rijksregister- of KBO-nummer",
    duplicates: "Waarschijnlijke dubbels",
    none: "Geen",
    receipts: "Attesten",
    receiptsIntro: "Eén per schenker en per jaar boven de drempel. Een verbetering behoudt het nummer en vervangt het attest; een annulering vraagt een reden.",
    issue: "De attesten van het jaar uitreiken",
    issued: "{n} attest(en) uitgereikt.",
    noReceipt: "Geen attest voor dit jaar.",
    number: "Nr.",
    status: "Status",
    statuses: { issued: "Uitgereikt", corrected: "Vervangen", cancelled: "Geannuleerd" },
    correction: "verbeterd",
    pdf: "PDF",
    pdfOf: "Het attest {n} van {name} als PDF openen",
    correct: "Verbeteren",
    correctOf: "Het attest {n} van {name} verbeteren volgens de huidige giften",
    cancelReceipt: "Annuleren",
    cancelReceiptOf: "Het attest {n} van {name} annuleren",
    send: "Per e-mail versturen",
    sent: "{n} attest(en) via een privélink verstuurd.",
    emailed: "verstuurd",
    belcotax: "Belcotax-on-Web",
    belcotaxIntro: "Het XML-bestand van de fiches 281.71 van het jaar, gecontroleerd vóór de export. Het bevat de rijksregisternummers: elke export wordt in het logboek genoteerd.",
    check: "Bestand controleren",
    export: "XML-bestand downloaden",
    checkOk: "Geen probleem gevonden in het bestand.",
    issues: {
      SENDER: "Het KBO-nummer of het adres van de club ontbreekt (Instellingen › Club).",
      IDENTIFIER: "Fiche {n}: rijksregister- of KBO-nummer ontbreekt of is fout.",
      AMOUNT: "Fiche {n}: ongeldig bedrag.",
      SEQUENCE: "Fiche {n}: dubbel nummer.",
      ADDRESS: "Fiche {n}: onvolledig adres.",
      COUNTRY: "Fiche {n}: schenker buiten België, na te kijken in Belcotax.",
      TOTALS: "De controletotalen kloppen niet.",
    },
    nationalTolerance: "Het rijksregisternummer is verplicht sinds de giften van 2024, met een tolerantie voor 2024 en 2025; voor 2026 moet de regel nog bevestigd worden.",
    rights: "Toegang tot de rijksregisternummers",
    rightsIntro: "Het voorzitterschap heeft altijd toegang. Elke opening wordt in het logboek genoteerd.",
    rightOf: "{name} mag de rijksregisternummers zien",
    noOne: "Niemand behalve het voorzitterschap.",
    cancel: "Sluiten",
    loading: "Laden…",
    errors: {
      TAX_NOT_APPROVED: "De fiscale attesten zijn niet geactiveerd voor deze club.",
      TAX_APPROVAL_REQUIRED: "Vermeld het nummer en de periode van de erkenning.",
      INVALID_NATIONAL_NUMBER: "Dit rijksregisternummer is niet geldig: controleer de 11 cijfers.",
      INVALID_COMPANY_NUMBER: "Dit ondernemingsnummer is niet geldig: controleer de 10 cijfers.",
      BELCOTAX_INVALID: "Het bestand heeft blokkerende problemen: verbeter ze eerst (knop « Bestand controleren »).",
      INVALID_DATE: "Attesten worden uitgereikt voor een begonnen jaar.",
    },
    donorTitle: "Uw rijksregisternummer voor het fiscaal attest",
    donorIntro: "{organization} dankt u voor uw gift. De wet vraagt uw rijksregisternummer voor het fiscaal attest: het wordt versleuteld, dient alleen voor de Belcotax-aangifte en wordt tien jaar na uw laatste gift gewist.",
    donorField: "Rijksregisternummer",
    donorHint: "11 cijfers, op de achterkant van uw identiteitskaart.",
    donorSend: "Versturen",
    donorDone: "Bedankt, uw nummer is opgeslagen. U mag deze pagina sluiten.",
    donorGone: "Deze link is niet meer geldig. Vraag de club een nieuwe.",
  },
  en: {
    title: "Tax receipts",
    intro: "The gifts without anything in return received in the year, the 281.71 receipt of each donor over the threshold and the file for Belcotax-on-Web.",
    approvalTitle: "Tax receipts",
    approvalIntro: "Only a non-profit approved by the SPF Finances may issue tax receipts for gifts. A sports club is not approved by default.",
    approvalQuestion: "Our non-profit is approved to issue tax receipts",
    yes: "Yes",
    no: "No",
    approvalNumber: "Approval number",
    approvalFrom: "Approved from",
    approvalTo: "Approved until",
    threshold: "Legal threshold per donor and year (€)",
    thresholdHint: "40 € today; change it if the law changes.",
    approvalRequired: "On « yes », the approval number and period are required.",
    save: "Save",
    saved: "Saved.",
    offHint: "On « no », nothing about tax receipts shows; the history is kept.",
    alertEnding: "The approval ends on {date}: remember to renew it.",
    alertEnded: "The approval ended on {date}: no receipt can cover gifts received after that date.",
    year: "Year of the gifts",
    deadline: "Belcotax-on-Web filing by {date} at the latest",
    deadlineHint: "Usual date (end of February); check the year's date on the SPF Finances website.",
    donors: "Donors",
    donorsIntro: "A person (national register number) or a company (BCE number).",
    addDonor: "Add a donor",
    editDonorOf: "Edit the donor {name}",
    edit: "Edit",
    noDonor: "No donor yet.",
    kind: "Type",
    kinds: { person: "Person", company: "Company" },
    name: "Name",
    street: "Street and number",
    postalCode: "Postal code",
    city: "Town",
    country: "Country (ISO code)",
    email: "E-mail address",
    companyNumber: "Company number (BCE)",
    contact: "Address book entry",
    noContact: "None",
    national: "National number",
    nationalSet: "Known",
    nationalMissing: "Missing",
    nationalOf: "National number of {name}",
    nationalHint: "11 digits. It is only used for Belcotax and is never asked in a bank transfer's communication.",
    reveal: "Show",
    revealOf: "Show the national number of {name}",
    request: "Ask the donor",
    requestOf: "Send {name} the secure form for their national number",
    requested: "Form sent to the donor.",
    requestPending: "Request sent",
    total: "Gifts of the year",
    purged: "Data erased (10 years after the last gift)",
    gifts: "Gifts",
    giftsIntro: "Only gifts without anything in return count: never a membership fee, sponsoring, a purchase (supper, sale) or a gift in kind.",
    addGift: "Add a gift",
    noGift: "No gift this year.",
    date: "Date",
    amount: "Amount (€)",
    nature: "Nature",
    natures: { gift: "Gift without return", in_kind: "Gift in kind (does not count)", purchase: "Purchase, supper, sale (does not count)", sponsor: "Sponsoring (does not count)", dues: "Membership fee (does not count)" },
    natureHint: "Only a gift of money without anything in return opens a receipt.",
    note: "Note",
    cancelGift: "Cancel",
    cancelGiftOf: "Cancel the gift of {name} of {date}",
    reason: "Reason",
    reasonHint: "At least 5 characters; it stays in the history.",
    cancelled: "Cancelled.",
    candidates: "To qualify",
    candidatesIntro: "The year's gifts recorded in the finances or the pots, not yet linked to a donor.",
    qualify: "Link",
    qualifyOf: "Link {name} of {date} to a donor",
    sources: { ledger: "Finances", pot: "Pot" },
    donor: "Donor",
    chooseDonor: "Choose a donor",
    report: "Control report",
    reportIntro: "To look at before issuing the receipts and exporting the file.",
    eligible: "Receipt planned",
    below: "Under the threshold",
    missing: "Without a national or BCE number",
    duplicates: "Probable duplicates",
    none: "None",
    receipts: "Receipts",
    receiptsIntro: "One per donor and year over the threshold. A correction keeps the number and replaces the receipt; a cancellation asks for a reason.",
    issue: "Issue the year's receipts",
    issued: "{n} receipt(s) issued.",
    noReceipt: "No receipt for this year.",
    number: "No.",
    status: "Status",
    statuses: { issued: "Issued", corrected: "Replaced", cancelled: "Cancelled" },
    correction: "corrected",
    pdf: "PDF",
    pdfOf: "Open receipt {n} of {name} as a PDF",
    correct: "Correct",
    correctOf: "Correct receipt {n} of {name} from the current gifts",
    cancelReceipt: "Cancel",
    cancelReceiptOf: "Cancel receipt {n} of {name}",
    send: "Send by e-mail",
    sent: "{n} receipt(s) sent through a private link.",
    emailed: "sent",
    belcotax: "Belcotax-on-Web",
    belcotaxIntro: "The XML file of the year's 281.71 fiches, checked before export. It holds the national numbers: every export is written to the journal.",
    check: "Check the file",
    export: "Download the XML file",
    checkOk: "No problem found in the file.",
    issues: {
      SENDER: "The club's BCE number or address is missing (Settings › Club).",
      IDENTIFIER: "Fiche {n}: national or BCE number missing or wrong.",
      AMOUNT: "Fiche {n}: invalid amount.",
      SEQUENCE: "Fiche {n}: duplicate number.",
      ADDRESS: "Fiche {n}: incomplete address.",
      COUNTRY: "Fiche {n}: donor outside Belgium, to check in Belcotax.",
      TOTALS: "The control totals do not match.",
    },
    nationalTolerance: "The national number is required since the gifts of 2024, with a tolerance for 2024 and 2025; for 2026 the rule is still to be confirmed.",
    rights: "Access to national numbers",
    rightsIntro: "The presidency always has access. Every opening is written to the journal.",
    rightOf: "{name} may see the national numbers",
    noOne: "No one but the presidency.",
    cancel: "Close",
    loading: "Loading…",
    errors: {
      TAX_NOT_APPROVED: "Tax receipts are not switched on for this club.",
      TAX_APPROVAL_REQUIRED: "Give the approval number and period.",
      INVALID_NATIONAL_NUMBER: "This national number is not valid: check the 11 digits.",
      INVALID_COMPANY_NUMBER: "This company number is not valid: check the 10 digits.",
      BELCOTAX_INVALID: "The file has blocking problems: fix them first (« Check the file »).",
      INVALID_DATE: "Receipts are issued for a year that has started.",
    },
    donorTitle: "Your national number for the tax receipt",
    donorIntro: "{organization} thanks you for your gift. The law asks for your national register number on the tax receipt: it is encrypted, only used for the Belcotax filing and erased ten years after your last gift.",
    donorField: "National register number",
    donorHint: "11 digits, on the back of your identity card.",
    donorSend: "Send",
    donorDone: "Thank you, your number is saved. You may close this page.",
    donorGone: "This link is no longer valid. Ask the club for a new one.",
  },
};
