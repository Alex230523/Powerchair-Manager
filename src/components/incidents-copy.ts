import type { Locale } from "@/lib/locale";

/** B5: incidents and their insurance declaration. `mail` is what the parents and the managers receive. */
export const incidentKinds = ["fall", "collision", "injury", "malaise", "chair_damage", "equipment_damage"] as const;
export const incidentContexts = ["training", "match", "trip", "other"] as const;
export const insuranceStatuses = ["to_declare", "sent", "accepted", "refused", "reimbursed", "not_needed"] as const;
type Copy = {
  title: string;
  intro: string;
  loading: string;
  unavailable: string;
  saved: string;
  save: string;
  cancel: string;
  close: string;
  tabs: Record<"list" | "insurance" | "stats" | "settings", string>;
  tabsLabel: string;
  declare: string;
  declareTitle: string;
  none: string;
  empty: string;
  occurredAt: string;
  context: string;
  contexts: Record<(typeof incidentContexts)[number], string>;
  event: string;
  noEvent: string;
  kind: string;
  kinds: Record<(typeof incidentKinds)[number], string>;
  people: string;
  peopleHint: string;
  minor: string;
  place: string;
  circumstances: string;
  circumstancesHint: string;
  witnesses: string;
  chair: string;
  chairHint: string;
  healthTitle: string;
  healthHint: string;
  injuries: string;
  firstAid: string;
  care: string;
  hospital: string;
  photos: string;
  photosHint: string;
  photoTooBig: string;
  careTitle: string;
  careNone: string;
  careMoments: Record<string, string>;
  declared: string;
  declaredMinor: string;
  by: string;
  facts: string;
  health: string;
  healthHidden: string;
  noHealth: string;
  chairLog: string;
  insurance: string;
  insurer: string;
  policy: string;
  insurerEmail: string;
  days: string;
  daysHint: string;
  deadline: string;
  status: string;
  statuses: Record<(typeof insuranceStatuses)[number], string>;
  states: Record<"ok" | "soon" | "overdue" | "done", string>;
  claim: string;
  sentOn: string;
  claimed: string;
  reimbursed: string;
  pieces: string;
  addPiece: string;
  noPieces: string;
  remove: string;
  pdf: string;
  stats: string;
  statsHint: string;
  byKind: string;
  byContext: string;
  byMonth: string;
  total: string;
  minors: string;
  noData: string;
  firstAidKit: string;
  firstAidOk: string;
  expiredOn: string;
  expiresOn: string;
  retention: string;
  open: string;
  mail: { minorTitle: string; minorMessage: string; deadlineTitle: string; deadlineMessage: string; firstAidTitle: string; firstAidMessage: string };
  pdfDoc: { title: string; club: string; insurer: string; policy: string; person: string; born: string; when: string; where: string; event: string; kind: string; facts: string; witnesses: string; health: string; healthMissing: string; signed: string };
  errors: Record<string, string>;
};

export const incidentsCopy: Record<Locale, Copy> = {
  fr: {
    title: "Incidents",
    intro: "Chutes, collisions, blessures, malaises et dommages : consignés tout de suite, suivis jusqu'au remboursement de l'assurance.",
    loading: "Chargement des incidents…",
    unavailable: "Les incidents ne sont pas disponibles pour le moment.",
    saved: "Enregistré.",
    save: "Enregistrer",
    cancel: "Annuler",
    close: "Fermer",
    tabs: { list: "Incidents", insurance: "Assurance", stats: "Statistiques", settings: "Réglages" },
    tabsLabel: "Sections des incidents",
    declare: "Déclarer un incident",
    declareTitle: "Déclarer un incident",
    none: "Aucun",
    empty: "Aucun incident déclaré.",
    occurredAt: "Date et heure",
    context: "Pendant",
    contexts: { training: "Entraînement", match: "Match", trip: "Déplacement", other: "Autre" },
    event: "Rendez-vous lié",
    noEvent: "Aucun",
    kind: "Type",
    kinds: { fall: "Chute", collision: "Collision", injury: "Blessure", malaise: "Malaise", chair_damage: "Dommage au fauteuil", equipment_damage: "Dommage au matériel" },
    people: "Personnes concernées",
    peopleHint: "Les parents d'un mineur sont prévenus tout de suite.",
    minor: "mineur",
    place: "Lieu",
    circumstances: "Circonstances",
    circumstancesHint: "Les faits seulement : ce qui s'est passé, où, comment. La santé se note plus bas.",
    witnesses: "Témoins",
    chair: "Fauteuil endommagé",
    chairHint: "Une intervention est créée dans le carnet du fauteuil.",
    healthTitle: "Santé",
    healthHint: "Gardé à part et visible seulement des personnes qui ont l'accès aux données de santé.",
    injuries: "Blessures constatées",
    firstAid: "Premiers soins donnés",
    care: "Suite (médecin, hôpital, retour à la maison)",
    hospital: "Transport à l'hôpital",
    photos: "Photos",
    photosHint: "Trois au plus, 1 Mo chacune (JPEG, PNG ou WebP). Traitées comme des données de santé.",
    photoTooBig: "Une photo dépasse 1 Mo.",
    careTitle: "Consignes de soin des personnes concernées",
    careNone: "Aucune consigne de soin enregistrée.",
    careMoments: { morning: "Matin", midday: "Midi", evening: "Soir", night: "Nuit", before_play: "Avant de jouer", after_play: "Après avoir joué", as_needed: "Au besoin" },
    declared: "Incident déclaré.",
    declaredMinor: "Incident déclaré. Les parents ont été prévenus.",
    by: "Déclaré par {name}",
    facts: "Les faits",
    health: "Santé",
    healthHidden: "Données de santé réservées aux personnes habilitées.",
    noHealth: "Rien de noté.",
    chairLog: "Intervention ajoutée au carnet du fauteuil.",
    insurance: "Assurance",
    insurer: "Assureur",
    policy: "Numéro de police",
    insurerEmail: "Adresse de déclaration",
    days: "Délai de déclaration (jours)",
    daysHint: "Compté à partir du jour de l'incident. Un rappel part deux jours avant l'échéance.",
    deadline: "À déclarer avant le {date}",
    status: "Statut",
    statuses: { to_declare: "À déclarer", sent: "Envoyé", accepted: "Accepté", refused: "Refusé", reimbursed: "Remboursé", not_needed: "Pas de déclaration" },
    states: { ok: "Dans les délais", soon: "Échéance proche", overdue: "Délai dépassé", done: "Traité" },
    claim: "Référence du dossier",
    sentOn: "Envoyé le",
    claimed: "Montant demandé (€)",
    reimbursed: "Montant remboursé (€)",
    pieces: "Pièces",
    addPiece: "Ajouter une pièce",
    noPieces: "Aucune pièce.",
    remove: "Retirer",
    pdf: "Formulaire prérempli (PDF)",
    stats: "Statistiques",
    statsHint: "Anonymes : par type, contexte et mois, jamais par personne. Les douze derniers mois.",
    byKind: "Par type",
    byContext: "Par contexte",
    byMonth: "Par mois",
    total: "Incidents",
    minors: "Dont avec un mineur",
    noData: "Pas encore de données.",
    firstAidKit: "Trousse de secours",
    firstAidOk: "Aucun article de premiers secours périmé ni bientôt périmé.",
    expiredOn: "périmé le {date}",
    expiresOn: "périme le {date}",
    retention: "Conservation : la partie santé et les photos sont effacées après 5 ans, l'incident après 10 ans.",
    open: "Ouvrir",
    mail: {
      minorTitle: "Incident : {child}",
      minorMessage: "Un incident a été déclaré pour {child} le {date}. Le détail est dans l'application et le club reste à votre disposition.",
      deadlineTitle: "Déclaration d'assurance à faire",
      deadlineMessage: "L'incident du {date} doit être déclaré à l'assurance avant le {deadline}.",
      firstAidTitle: "Trousse de secours",
      firstAidMessage: "« {item} » périme le {date}. Pensez à le remplacer.",
    },
    pdfDoc: {
      title: "Déclaration d'accident",
      club: "Club",
      insurer: "Assureur",
      policy: "Police",
      person: "Personne concernée",
      born: "née le",
      when: "Date et heure",
      where: "Lieu",
      event: "Activité",
      kind: "Type",
      facts: "Circonstances",
      witnesses: "Témoins",
      health: "Blessures et soins",
      healthMissing: "À compléter par une personne qui a l'accès aux données de santé.",
      signed: "Document préparé par le club le {date}, à signer et à joindre aux certificats médicaux.",
    },
    errors: {
      NOT_DECLARABLE: "Vous ne pouvez déclarer que pour les joueurs de vos équipes.",
      INVALID_IMAGE: "Une photo n'est pas une image valide.",
      INVALID_FILE: "Le fichier n'est pas valide (PDF ou image, 2 Mo au plus).",
      INVALID_DATE: "La date ne peut pas être dans le futur.",
      TOO_MANY_PHOTOS: "Trois photos au plus.",
    },
  },
  nl: {
    title: "Incidenten",
    intro: "Vallen, botsingen, verwondingen, onwel worden en schade: meteen genoteerd, opgevolgd tot de terugbetaling door de verzekering.",
    loading: "Incidenten laden…",
    unavailable: "De incidenten zijn momenteel niet beschikbaar.",
    saved: "Opgeslagen.",
    save: "Opslaan",
    cancel: "Annuleren",
    close: "Sluiten",
    tabs: { list: "Incidenten", insurance: "Verzekering", stats: "Statistieken", settings: "Instellingen" },
    tabsLabel: "Onderdelen van de incidenten",
    declare: "Incident melden",
    declareTitle: "Incident melden",
    none: "Geen",
    empty: "Geen incident gemeld.",
    occurredAt: "Datum en uur",
    context: "Tijdens",
    contexts: { training: "Training", match: "Wedstrijd", trip: "Verplaatsing", other: "Ander" },
    event: "Gekoppelde afspraak",
    noEvent: "Geen",
    kind: "Soort",
    kinds: { fall: "Val", collision: "Botsing", injury: "Verwonding", malaise: "Onwel", chair_damage: "Schade aan de rolstoel", equipment_damage: "Schade aan het materiaal" },
    people: "Betrokken personen",
    peopleHint: "De ouders van een minderjarige worden meteen verwittigd.",
    minor: "minderjarig",
    place: "Plaats",
    circumstances: "Omstandigheden",
    circumstancesHint: "Enkel de feiten: wat er gebeurde, waar, hoe. De gezondheid noteert u lager.",
    witnesses: "Getuigen",
    chair: "Beschadigde rolstoel",
    chairHint: "Er wordt een interventie in het logboek van de rolstoel aangemaakt.",
    healthTitle: "Gezondheid",
    healthHint: "Apart bewaard en enkel zichtbaar voor wie toegang heeft tot gezondheidsgegevens.",
    injuries: "Vastgestelde verwondingen",
    firstAid: "Gegeven eerste hulp",
    care: "Vervolg (arts, ziekenhuis, naar huis)",
    hospital: "Vervoer naar het ziekenhuis",
    photos: "Foto's",
    photosHint: "Maximaal drie, 1 MB elk (JPEG, PNG of WebP). Behandeld als gezondheidsgegevens.",
    photoTooBig: "Een foto is groter dan 1 MB.",
    careTitle: "Zorginstructies van de betrokken personen",
    careNone: "Geen zorginstructie geregistreerd.",
    careMoments: { morning: "Ochtend", midday: "Middag", evening: "Avond", night: "Nacht", before_play: "Voor het spelen", after_play: "Na het spelen", as_needed: "Indien nodig" },
    declared: "Incident gemeld.",
    declaredMinor: "Incident gemeld. De ouders zijn verwittigd.",
    by: "Gemeld door {name}",
    facts: "De feiten",
    health: "Gezondheid",
    healthHidden: "Gezondheidsgegevens voorbehouden aan bevoegde personen.",
    noHealth: "Niets genoteerd.",
    chairLog: "Interventie toegevoegd aan het logboek van de rolstoel.",
    insurance: "Verzekering",
    insurer: "Verzekeraar",
    policy: "Polisnummer",
    insurerEmail: "Aangifteadres",
    days: "Aangiftetermijn (dagen)",
    daysHint: "Gerekend vanaf de dag van het incident. Twee dagen voor de vervaldag vertrekt een herinnering.",
    deadline: "Aan te geven voor {date}",
    status: "Status",
    statuses: { to_declare: "Aan te geven", sent: "Verstuurd", accepted: "Aanvaard", refused: "Geweigerd", reimbursed: "Terugbetaald", not_needed: "Geen aangifte" },
    states: { ok: "Binnen de termijn", soon: "Vervaldag nabij", overdue: "Termijn verstreken", done: "Behandeld" },
    claim: "Dossierreferentie",
    sentOn: "Verstuurd op",
    claimed: "Gevraagd bedrag (€)",
    reimbursed: "Terugbetaald bedrag (€)",
    pieces: "Stukken",
    addPiece: "Stuk toevoegen",
    noPieces: "Geen stukken.",
    remove: "Verwijderen",
    pdf: "Vooraf ingevuld formulier (PDF)",
    stats: "Statistieken",
    statsHint: "Anoniem: per soort, context en maand, nooit per persoon. De laatste twaalf maanden.",
    byKind: "Per soort",
    byContext: "Per context",
    byMonth: "Per maand",
    total: "Incidenten",
    minors: "Waarvan met een minderjarige",
    noData: "Nog geen gegevens.",
    firstAidKit: "EHBO-koffer",
    firstAidOk: "Geen vervallen of bijna vervallen EHBO-artikel.",
    expiredOn: "vervallen op {date}",
    expiresOn: "vervalt op {date}",
    retention: "Bewaring: het gezondheidsdeel en de foto's worden na 5 jaar gewist, het incident na 10 jaar.",
    open: "Openen",
    mail: {
      minorTitle: "Incident: {child}",
      minorMessage: "Er werd op {date} een incident gemeld voor {child}. De details staan in de toepassing en de club staat tot uw beschikking.",
      deadlineTitle: "Verzekeringsaangifte te doen",
      deadlineMessage: "Het incident van {date} moet voor {deadline} bij de verzekering worden aangegeven.",
      firstAidTitle: "EHBO-koffer",
      firstAidMessage: "« {item} » vervalt op {date}. Denk eraan het te vervangen.",
    },
    pdfDoc: {
      title: "Ongevalsaangifte",
      club: "Club",
      insurer: "Verzekeraar",
      policy: "Polis",
      person: "Betrokken persoon",
      born: "geboren op",
      when: "Datum en uur",
      where: "Plaats",
      event: "Activiteit",
      kind: "Soort",
      facts: "Omstandigheden",
      witnesses: "Getuigen",
      health: "Verwondingen en zorg",
      healthMissing: "In te vullen door iemand met toegang tot gezondheidsgegevens.",
      signed: "Document voorbereid door de club op {date}, te ondertekenen en bij de medische attesten te voegen.",
    },
    errors: {
      NOT_DECLARABLE: "U kunt enkel melden voor de spelers van uw ploegen.",
      INVALID_IMAGE: "Een foto is geen geldige afbeelding.",
      INVALID_FILE: "Het bestand is niet geldig (PDF of afbeelding, maximaal 2 MB).",
      INVALID_DATE: "De datum mag niet in de toekomst liggen.",
      TOO_MANY_PHOTOS: "Maximaal drie foto's.",
    },
  },
  en: {
    title: "Incidents",
    intro: "Falls, collisions, injuries, malaises and damage: recorded at once, followed until the insurance pays back.",
    loading: "Loading the incidents…",
    unavailable: "The incidents are not available right now.",
    saved: "Saved.",
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    tabs: { list: "Incidents", insurance: "Insurance", stats: "Statistics", settings: "Settings" },
    tabsLabel: "Incident sections",
    declare: "Report an incident",
    declareTitle: "Report an incident",
    none: "None",
    empty: "No incident reported.",
    occurredAt: "Date and time",
    context: "During",
    contexts: { training: "Training", match: "Match", trip: "Trip", other: "Other" },
    event: "Linked appointment",
    noEvent: "None",
    kind: "Type",
    kinds: { fall: "Fall", collision: "Collision", injury: "Injury", malaise: "Malaise", chair_damage: "Damage to the chair", equipment_damage: "Damage to equipment" },
    people: "People involved",
    peopleHint: "The parents of a minor are told at once.",
    minor: "minor",
    place: "Place",
    circumstances: "Circumstances",
    circumstancesHint: "The facts only: what happened, where, how. Health is noted below.",
    witnesses: "Witnesses",
    chair: "Damaged chair",
    chairHint: "An intervention is created in the chair's log.",
    healthTitle: "Health",
    healthHint: "Kept apart and visible only to the people with access to health data.",
    injuries: "Injuries seen",
    firstAid: "First aid given",
    care: "Follow-up (doctor, hospital, home)",
    hospital: "Taken to hospital",
    photos: "Photos",
    photosHint: "Three at most, 1 MB each (JPEG, PNG or WebP). Treated as health data.",
    photoTooBig: "A photo is larger than 1 MB.",
    careTitle: "Care instructions of the people involved",
    careNone: "No care instruction recorded.",
    careMoments: { morning: "Morning", midday: "Midday", evening: "Evening", night: "Night", before_play: "Before playing", after_play: "After playing", as_needed: "As needed" },
    declared: "Incident reported.",
    declaredMinor: "Incident reported. The parents have been told.",
    by: "Reported by {name}",
    facts: "The facts",
    health: "Health",
    healthHidden: "Health data reserved to the authorised people.",
    noHealth: "Nothing noted.",
    chairLog: "Intervention added to the chair's log.",
    insurance: "Insurance",
    insurer: "Insurer",
    policy: "Policy number",
    insurerEmail: "Claims address",
    days: "Time to declare (days)",
    daysHint: "Counted from the day of the incident. A reminder leaves two days before the deadline.",
    deadline: "To declare before {date}",
    status: "Status",
    statuses: { to_declare: "To declare", sent: "Sent", accepted: "Accepted", refused: "Refused", reimbursed: "Reimbursed", not_needed: "No claim" },
    states: { ok: "On time", soon: "Deadline close", overdue: "Deadline passed", done: "Handled" },
    claim: "Claim reference",
    sentOn: "Sent on",
    claimed: "Amount claimed (€)",
    reimbursed: "Amount reimbursed (€)",
    pieces: "Papers",
    addPiece: "Add a paper",
    noPieces: "No papers.",
    remove: "Remove",
    pdf: "Prefilled form (PDF)",
    stats: "Statistics",
    statsHint: "Anonymous: by type, context and month, never by person. The last twelve months.",
    byKind: "By type",
    byContext: "By context",
    byMonth: "By month",
    total: "Incidents",
    minors: "Of which with a minor",
    noData: "No data yet.",
    firstAidKit: "First-aid kit",
    firstAidOk: "No first-aid item expired or about to expire.",
    expiredOn: "expired on {date}",
    expiresOn: "expires on {date}",
    retention: "Retention: the health part and the photos are erased after 5 years, the incident after 10 years.",
    open: "Open",
    mail: {
      minorTitle: "Incident: {child}",
      minorMessage: "An incident was reported for {child} on {date}. The details are in the application and the club remains at your disposal.",
      deadlineTitle: "Insurance claim to file",
      deadlineMessage: "The incident of {date} must be declared to the insurer before {deadline}.",
      firstAidTitle: "First-aid kit",
      firstAidMessage: "« {item} » expires on {date}. Remember to replace it.",
    },
    pdfDoc: {
      title: "Accident report",
      club: "Club",
      insurer: "Insurer",
      policy: "Policy",
      person: "Person involved",
      born: "born on",
      when: "Date and time",
      where: "Place",
      event: "Activity",
      kind: "Type",
      facts: "Circumstances",
      witnesses: "Witnesses",
      health: "Injuries and care",
      healthMissing: "To be completed by someone with access to health data.",
      signed: "Document prepared by the club on {date}, to sign and join to the medical certificates.",
    },
    errors: {
      NOT_DECLARABLE: "You can only report for the players of your teams.",
      INVALID_IMAGE: "A photo is not a valid image.",
      INVALID_FILE: "The file is not valid (PDF or image, 2 MB at most).",
      INVALID_DATE: "The date cannot be in the future.",
      TOO_MANY_PHOTOS: "Three photos at most.",
    },
  },
};
