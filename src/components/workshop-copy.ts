import type { Locale } from "@/lib/locale";

/** B3: the chairs' workshop (interventions, components, speed, bookings, breakdowns). */
type Copy = {
  tab: string;
  intro: string;
  loading: string;
  unavailable: string;
  saved: string;
  save: string;
  cancel: string;
  none: string;
  alerts: string;
  noAlerts: string;
  alertKinds: Record<"service" | "warranty" | "speed" | "loan" | "supply" | "report", string>;
  speedStates: Record<"ok" | "missing" | "old" | "over", string>;
  availability: string;
  noEvents: string;
  expected: string;
  missing: string;
  allSet: string;
  own: string;
  booked: string;
  noChair: string;
  chairOf: string;
  book: string;
  noFree: string;
  release: string;
  rules: string;
  limit: string;
  checkDays: string;
  interventions: string;
  noInterventions: string;
  kinds: Record<"service" | "breakdown" | "repair" | "battery" | "adjustment" | "speed_check", string>;
  addIntervention: string;
  date: string;
  kind: string;
  diagnosis: string;
  parts: string;
  supplier: string;
  cost: string;
  daysOut: string;
  invoice: string;
  invoiceHint: string;
  speedKmh: string;
  checker: string;
  backInService: string;
  cancelIntervention: string;
  cancelReason: string;
  cancelled: string;
  components: string;
  noComponents: string;
  componentKinds: Record<"battery" | "charger", string>;
  componentKind: string;
  label: string;
  serial: string;
  since: string;
  addComponent: string;
  replace: string;
  replaceOf: string;
  newLabel: string;
  retiredOn: string;
  funding: string;
  warranty: string;
  purchase: string;
  grant: string;
  partner: string;
  pot: string;
  ownership: string;
  upkeep: string;
  total: string;
  daysOutTotal: string;
  report: string;
  xlsx: string;
  pdf: string;
  speed: string;
  lastSpeed: string;
  never: string;
  clubLimit: string;
  reports: string;
  noReports: string;
  reportOpen: string;
  reportClosed: string;
  closeReport: string;
  withPhoto: string;
  reportButton: string;
  reportTitle: string;
  describe: string;
  photo: string;
  photoHint: string;
  photoTooBig: string;
  send: string;
  reported: string;
  pdfTitle: string;
  club: string;
  brand: string;
  serialNumber: string;
  acquired: string;
  fundedBy: string;
  errors: Record<string, string>;
};

export const workshopCopy: Record<Locale, Copy> = {
  fr: {
    tab: "Atelier",
    intro: "Ce qui demande votre attention, et les fauteuils prévus pour les événements des 14 prochains jours.",
    loading: "Chargement de l'atelier…",
    unavailable: "L'atelier n'est pas disponible pour le moment.",
    saved: "Enregistré.",
    save: "Enregistrer",
    cancel: "Annuler",
    none: "Aucun",
    alerts: "À surveiller",
    noAlerts: "Rien à surveiller pour l'instant.",
    alertKinds: { service: "Révision dépassée", warranty: "Garantie qui se termine", speed: "Contrôle de vitesse", loan: "Prêt non rendu", supply: "Fourniture périmée", report: "Panne signalée" },
    speedStates: { ok: "Vitesse contrôlée", missing: "Jamais contrôlée", old: "Contrôle trop ancien", over: "Au-dessus de la limite" },
    availability: "Fauteuils pour les prochains événements",
    noEvents: "Aucun événement d'équipe dans les 14 prochains jours.",
    expected: "{n} joueurs attendus",
    missing: "Sans fauteuil utilisable : {n}",
    allSet: "Chaque joueur attendu a un fauteuil utilisable.",
    own: "Son fauteuil : {chair}",
    booked: "Réservé : {chair}",
    noChair: "Pas de fauteuil utilisable",
    chairOf: "Fauteuil du club pour {name}",
    book: "Réserver",
    noFree: "Aucun fauteuil du club n'est libre pour cet événement.",
    release: "Libérer",
    rules: "Règle de vitesse",
    limit: "Vitesse maximale autorisée (km/h)",
    checkDays: "Contrôle à refaire après (jours)",
    interventions: "Carnet d'interventions",
    noInterventions: "Aucune intervention enregistrée.",
    kinds: { service: "Révision", breakdown: "Panne", repair: "Réparation", battery: "Batterie", adjustment: "Réglage", speed_check: "Contrôle de vitesse" },
    addIntervention: "Ajouter une intervention",
    date: "Date",
    kind: "Type",
    diagnosis: "Diagnostic",
    parts: "Pièces",
    supplier: "Fournisseur",
    cost: "Coût (€)",
    daysOut: "Jours d'immobilisation",
    invoice: "Facture",
    invoiceHint: "Une dépense des finances. Son montant est repris si le coût est vide.",
    speedKmh: "Vitesse mesurée (km/h)",
    checker: "Contrôlé par",
    backInService: "Le fauteuil est de nouveau utilisable",
    cancelIntervention: "Annuler l'intervention",
    cancelReason: "Raison de l'annulation",
    cancelled: "Annulée : {reason}",
    components: "Batteries et chargeurs",
    noComponents: "Aucune batterie ni aucun chargeur enregistré.",
    componentKinds: { battery: "Batterie", charger: "Chargeur" },
    componentKind: "Batterie ou chargeur",
    label: "Désignation",
    serial: "Numéro de série",
    since: "En service depuis",
    addComponent: "Ajouter",
    replace: "Remplacer",
    replaceOf: "Remplacer {label}",
    newLabel: "Nouvelle désignation",
    retiredOn: "Retiré le {date}",
    funding: "Garantie et financement",
    warranty: "Garantie jusqu'au",
    purchase: "Valeur d'achat (€)",
    grant: "Subside",
    partner: "Sponsor",
    pot: "Cagnotte",
    ownership: "Coût du fauteuil",
    upkeep: "Entretien et réparations",
    total: "Coût total",
    daysOutTotal: "Jours hors service",
    report: "Rapport du fauteuil",
    xlsx: "Tableur (.xlsx)",
    pdf: "PDF",
    speed: "Vitesse",
    lastSpeed: "Dernier contrôle : {kmh} km/h le {date}",
    never: "Jamais contrôlée",
    clubLimit: "Limite du club : {limit} km/h, à recontrôler tous les {days} jours.",
    reports: "Pannes signalées",
    noReports: "Aucune panne signalée.",
    reportOpen: "Ouverte",
    reportClosed: "Close",
    closeReport: "Clore",
    withPhoto: "Photo",
    reportButton: "Signaler une panne",
    reportTitle: "Signaler une panne : {chair}",
    describe: "Que se passe-t-il ?",
    photo: "Photo (facultatif)",
    photoHint: "JPEG, PNG ou WebP, 1 Mo au plus.",
    photoTooBig: "La photo dépasse 1 Mo.",
    send: "Envoyer",
    reported: "Panne signalée. Le fauteuil est hors service et les responsables du matériel sont prévenus.",
    pdfTitle: "Rapport du fauteuil {chair}",
    club: "Club",
    brand: "Marque et modèle",
    serialNumber: "Numéro de série",
    acquired: "Acquis le",
    fundedBy: "Financé par",
    errors: {
      CHAIR_TAKEN: "Ce fauteuil est déjà réservé pour cet événement par un autre joueur.",
      CHAIR_UNAVAILABLE: "Ce fauteuil n'est pas disponible.",
      NOT_INVITED: "Ce joueur n'est pas invité à cet événement.",
      INVALID_IMAGE: "La photo n'est pas une image valide.",
      INVALID_DATE: "La date ne peut pas être dans le futur.",
    },
  },
  nl: {
    tab: "Werkplaats",
    intro: "Wat uw aandacht vraagt, en de rolstoelen voor de evenementen van de komende 14 dagen.",
    loading: "Werkplaats laden…",
    unavailable: "De werkplaats is momenteel niet beschikbaar.",
    saved: "Opgeslagen.",
    save: "Opslaan",
    cancel: "Annuleren",
    none: "Geen",
    alerts: "Op te volgen",
    noAlerts: "Momenteel niets op te volgen.",
    alertKinds: { service: "Onderhoud verlopen", warranty: "Garantie loopt af", speed: "Snelheidscontrole", loan: "Lening niet teruggebracht", supply: "Vervallen benodigdheid", report: "Defect gemeld" },
    speedStates: { ok: "Snelheid gecontroleerd", missing: "Nooit gecontroleerd", old: "Controle te oud", over: "Boven de limiet" },
    availability: "Rolstoelen voor de volgende evenementen",
    noEvents: "Geen ploegevenement in de komende 14 dagen.",
    expected: "{n} spelers verwacht",
    missing: "Zonder bruikbare rolstoel: {n}",
    allSet: "Elke verwachte speler heeft een bruikbare rolstoel.",
    own: "Eigen rolstoel: {chair}",
    booked: "Gereserveerd: {chair}",
    noChair: "Geen bruikbare rolstoel",
    chairOf: "Clubrolstoel voor {name}",
    book: "Reserveren",
    noFree: "Geen enkele clubrolstoel is vrij voor dit evenement.",
    release: "Vrijgeven",
    rules: "Snelheidsregel",
    limit: "Toegelaten maximumsnelheid (km/u)",
    checkDays: "Opnieuw controleren na (dagen)",
    interventions: "Interventielogboek",
    noInterventions: "Geen interventie geregistreerd.",
    kinds: { service: "Onderhoud", breakdown: "Defect", repair: "Herstelling", battery: "Batterij", adjustment: "Afstelling", speed_check: "Snelheidscontrole" },
    addIntervention: "Interventie toevoegen",
    date: "Datum",
    kind: "Soort",
    diagnosis: "Diagnose",
    parts: "Onderdelen",
    supplier: "Leverancier",
    cost: "Kost (€)",
    daysOut: "Dagen buiten gebruik",
    invoice: "Factuur",
    invoiceHint: "Een uitgave uit de financiën. Het bedrag wordt overgenomen als de kost leeg is.",
    speedKmh: "Gemeten snelheid (km/u)",
    checker: "Gecontroleerd door",
    backInService: "De rolstoel is opnieuw bruikbaar",
    cancelIntervention: "Interventie annuleren",
    cancelReason: "Reden van annulering",
    cancelled: "Geannuleerd: {reason}",
    components: "Batterijen en laders",
    noComponents: "Geen batterij of lader geregistreerd.",
    componentKinds: { battery: "Batterij", charger: "Lader" },
    componentKind: "Batterij of lader",
    label: "Omschrijving",
    serial: "Serienummer",
    since: "In gebruik sinds",
    addComponent: "Toevoegen",
    replace: "Vervangen",
    replaceOf: "{label} vervangen",
    newLabel: "Nieuwe omschrijving",
    retiredOn: "Vervangen op {date}",
    funding: "Garantie en financiering",
    warranty: "Garantie tot",
    purchase: "Aankoopwaarde (€)",
    grant: "Subsidie",
    partner: "Sponsor",
    pot: "Inzamelpot",
    ownership: "Kost van de rolstoel",
    upkeep: "Onderhoud en herstellingen",
    total: "Totale kost",
    daysOutTotal: "Dagen buiten dienst",
    report: "Rapport van de rolstoel",
    xlsx: "Rekenblad (.xlsx)",
    pdf: "PDF",
    speed: "Snelheid",
    lastSpeed: "Laatste controle: {kmh} km/u op {date}",
    never: "Nooit gecontroleerd",
    clubLimit: "Clublimiet: {limit} km/u, opnieuw te controleren om de {days} dagen.",
    reports: "Gemelde defecten",
    noReports: "Geen defect gemeld.",
    reportOpen: "Open",
    reportClosed: "Afgesloten",
    closeReport: "Afsluiten",
    withPhoto: "Foto",
    reportButton: "Defect melden",
    reportTitle: "Defect melden: {chair}",
    describe: "Wat is er aan de hand?",
    photo: "Foto (optioneel)",
    photoHint: "JPEG, PNG of WebP, maximaal 1 MB.",
    photoTooBig: "De foto is groter dan 1 MB.",
    send: "Versturen",
    reported: "Defect gemeld. De rolstoel is buiten dienst en de materiaalverantwoordelijken zijn verwittigd.",
    pdfTitle: "Rapport van rolstoel {chair}",
    club: "Club",
    brand: "Merk en model",
    serialNumber: "Serienummer",
    acquired: "Aangekocht op",
    fundedBy: "Gefinancierd door",
    errors: {
      CHAIR_TAKEN: "Deze rolstoel is al door een andere speler gereserveerd voor dit evenement.",
      CHAIR_UNAVAILABLE: "Deze rolstoel is niet beschikbaar.",
      NOT_INVITED: "Deze speler is niet uitgenodigd voor dit evenement.",
      INVALID_IMAGE: "De foto is geen geldige afbeelding.",
      INVALID_DATE: "De datum mag niet in de toekomst liggen.",
    },
  },
  en: {
    tab: "Workshop",
    intro: "What needs your attention, and the chairs planned for the team events of the next 14 days.",
    loading: "Loading the workshop…",
    unavailable: "The workshop is not available right now.",
    saved: "Saved.",
    save: "Save",
    cancel: "Cancel",
    none: "None",
    alerts: "To watch",
    noAlerts: "Nothing to watch for now.",
    alertKinds: { service: "Service overdue", warranty: "Warranty ending", speed: "Speed check", loan: "Loan not returned", supply: "Expired supply", report: "Breakdown reported" },
    speedStates: { ok: "Speed checked", missing: "Never checked", old: "Check too old", over: "Above the limit" },
    availability: "Chairs for the next events",
    noEvents: "No team event in the next 14 days.",
    expected: "{n} players expected",
    missing: "Without a usable chair: {n}",
    allSet: "Every expected player has a usable chair.",
    own: "Own chair: {chair}",
    booked: "Booked: {chair}",
    noChair: "No usable chair",
    chairOf: "Club chair for {name}",
    book: "Book",
    noFree: "No club chair is free for this event.",
    release: "Release",
    rules: "Speed rule",
    limit: "Maximum speed allowed (km/h)",
    checkDays: "Check again after (days)",
    interventions: "Intervention log",
    noInterventions: "No intervention recorded.",
    kinds: { service: "Service", breakdown: "Breakdown", repair: "Repair", battery: "Battery", adjustment: "Adjustment", speed_check: "Speed check" },
    addIntervention: "Add an intervention",
    date: "Date",
    kind: "Type",
    diagnosis: "Diagnosis",
    parts: "Parts",
    supplier: "Supplier",
    cost: "Cost (€)",
    daysOut: "Days out of use",
    invoice: "Invoice",
    invoiceHint: "An expense from the finances. Its amount is used when the cost is empty.",
    speedKmh: "Measured speed (km/h)",
    checker: "Checked by",
    backInService: "The chair is usable again",
    cancelIntervention: "Cancel the intervention",
    cancelReason: "Reason for cancelling",
    cancelled: "Cancelled: {reason}",
    components: "Batteries and chargers",
    noComponents: "No battery or charger recorded.",
    componentKinds: { battery: "Battery", charger: "Charger" },
    componentKind: "Battery or charger",
    label: "Description",
    serial: "Serial number",
    since: "In service since",
    addComponent: "Add",
    replace: "Replace",
    replaceOf: "Replace {label}",
    newLabel: "New description",
    retiredOn: "Replaced on {date}",
    funding: "Warranty and funding",
    warranty: "Warranty until",
    purchase: "Purchase value (€)",
    grant: "Grant",
    partner: "Sponsor",
    pot: "Fundraising pot",
    ownership: "Cost of the chair",
    upkeep: "Service and repairs",
    total: "Total cost",
    daysOutTotal: "Days out of service",
    report: "Chair report",
    xlsx: "Spreadsheet (.xlsx)",
    pdf: "PDF",
    speed: "Speed",
    lastSpeed: "Last check: {kmh} km/h on {date}",
    never: "Never checked",
    clubLimit: "Club limit: {limit} km/h, to check again every {days} days.",
    reports: "Reported breakdowns",
    noReports: "No breakdown reported.",
    reportOpen: "Open",
    reportClosed: "Closed",
    closeReport: "Close",
    withPhoto: "Photo",
    reportButton: "Report a breakdown",
    reportTitle: "Report a breakdown: {chair}",
    describe: "What is happening?",
    photo: "Photo (optional)",
    photoHint: "JPEG, PNG or WebP, 1 MB at most.",
    photoTooBig: "The photo is larger than 1 MB.",
    send: "Send",
    reported: "Breakdown reported. The chair is out of service and the equipment managers have been told.",
    pdfTitle: "Report of the chair {chair}",
    club: "Club",
    brand: "Brand and model",
    serialNumber: "Serial number",
    acquired: "Acquired on",
    fundedBy: "Funded by",
    errors: {
      CHAIR_TAKEN: "This chair is already booked for this event by another player.",
      CHAIR_UNAVAILABLE: "This chair is not available.",
      NOT_INVITED: "This player is not invited to this event.",
      INVALID_IMAGE: "The photo is not a valid image.",
      INVALID_DATE: "The date cannot be in the future.",
    },
  },
};
