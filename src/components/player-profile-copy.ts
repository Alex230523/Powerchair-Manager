import type { Locale } from "../lib/locale";
type Copy = {
  back: string;
  personalTab: string;
  sportTab: string;
  loading: string;
  unavailable: string;
  edit: string;
  cancel: string;
  save: string;
  saved: string;
  empty: string;
  identity: string;
  birth: string;
  age: string;
  years: string;
  email: string;
  phone: string;
  joined: string;
  account: string;
  yes: string;
  no: string;
  noDetails: string;
  support: string;
  supportHint: string;
  supportNeeds: string;
  safety: string;
  emergency: string;
  confidential: string;
  confidentialHint: string;
  impairment: string;
  medical: string;
  restricted: string;
  guardians: string;
  noGuardians: string;
  relationKinds: Record<
    "legal_verified" | "delegated_aid" | "declared",
    string
  >;
  canEdit: string;
  canView: string;
  history: string;
  joinedClub: string;
  current: string;
  ended: string;
  roles: Record<string, string>;
  formerPlayer: string;
  attendance: string;
  attendanceRate: string;
  answerRate: string;
  closedSessions: string;
  recent: string;
  noAttendance: string;
  responses: Record<"none" | "present" | "absent" | "uncertain", string>;
  actuals: Record<
    "unchecked" | "present" | "absent" | "late" | "early",
    string
  >;
  cancelled: string;
  documents: string;
  dues: string;
  nextDue: string;
  game: string;
  position: string;
  jersey: string;
  team: string;
  classification: string;
  classificationHint: string;
  classifications: Record<"PF1" | "PF2" | "pending" | "not_classified", string>;
  validUntil: string;
  control: string;
  controls: Record<string, string>;
  sportNotes: string;
  chairs: string;
  noChair: string;
  primary: string;
  speed: string;
  shared: string;
  equipmentLink: string;
  stats: string;
  allEvents: string;
  matchStatsSoon: string;
  invitations: string;
  presences: string;
  errors: Record<string, string>;
};
export const playerProfileCopy: Record<Locale, Copy> = {
  fr: {
    back: "Tous les joueurs",
    personalTab: "Vue personnelle",
    sportTab: "Vue sportive",
    loading: "Chargement de la fiche…",
    unavailable: "Cette fiche n’est pas accessible avec votre profil actif.",
    edit: "Modifier",
    cancel: "Annuler",
    save: "Enregistrer",
    saved: "Enregistré.",
    empty: "Non renseigné",
    identity: "Informations personnelles",
    birth: "Date de naissance",
    age: "Âge",
    years: "ans",
    email: "Email",
    phone: "Téléphone",
    joined: "Membre depuis",
    account: "Compte de connexion",
    yes: "Oui",
    no: "Non",
    noDetails:
      "Les informations personnelles sont réservées à la personne, à ses représentants et aux responsables du répertoire.",
    support: "Besoins et accompagnement",
    supportHint:
      "Informations pratiques pour encadrer le joueur en sécurité. Visibles par ses coachs.",
    supportNeeds:
      "Besoins d’accompagnement (transferts, communication, routines)",
    safety: "Sécurité sur le terrain",
    emergency: "Contact d’urgence",
    confidential: "Handicap et santé",
    confidentialHint:
      "Confidentiel et chiffré. Visible uniquement par la personne, ses représentants légaux et le personnel disposant d’une habilitation explicite. Jamais affiché dans les listes.",
    impairment: "Handicap ou diagnostic",
    medical:
      "Informations médicales utiles (traitements, allergies, protocole d’urgence)",
    restricted:
      "Accès réservé. Ces informations confidentielles ne sont pas visibles avec votre profil.",
    guardians: "Personnes responsables",
    noGuardians: "Aucun représentant enregistré.",
    relationKinds: {
      legal_verified: "Représentant légal vérifié",
      delegated_aid: "Aide déléguée",
      declared: "Relation déclarée",
    },
    canEdit: "peut modifier",
    canView: "peut consulter",
    history: "Historique au club",
    joinedClub: "Arrivée au club",
    current: "En cours",
    ended: "Terminé",
    roles: {
      player: "Joueur",
      coach: "Coach",
      assistant: "Assistant",
      volunteer: "Bénévole",
    },
    formerPlayer: "Ancien joueur",
    attendance: "Présences",
    attendanceRate: "Taux de présence",
    answerRate: "Réponses aux invitations",
    closedSessions: "séances pointées",
    recent: "Derniers événements",
    noAttendance: "Aucune invitation pour l’instant.",
    responses: {
      none: "Pas de réponse",
      present: "Présent",
      absent: "Absent",
      uncertain: "Incertain",
    },
    actuals: {
      unchecked: "Non pointé",
      present: "Présent",
      absent: "Absent",
      late: "En retard",
      early: "Parti plus tôt",
    },
    cancelled: "Annulé",
    documents: "Documents",
    dues: "Cotisations",
    nextDue: "Prochaine échéance",
    game: "Profil de jeu",
    position: "Poste",
    jersey: "Numéro",
    team: "Équipe",
    classification: "Classification sportive",
    classificationHint:
      "Classe sportive officielle (FIPFA). Ce n’est pas une donnée médicale.",
    classifications: {
      PF1: "PF1",
      PF2: "PF2",
      pending: "Évaluation en cours",
      not_classified: "Non classé",
    },
    validUntil: "Valable jusqu’au",
    control: "Commande du fauteuil",
    controls: {
      "": "Non renseignée",
      right_hand: "Main droite",
      left_hand: "Main gauche",
      chin: "Menton",
      head: "Tête",
      other: "Autre",
    },
    sportNotes: "Notes sportives (points forts, rôle, consignes)",
    chairs: "Fauteuils",
    noChair: "Aucun fauteuil lié à ce joueur.",
    primary: "Principal",
    speed: "Vitesse max.",
    shared: "partagé avec",
    equipmentLink: "Voir le matériel",
    stats: "Statistiques",
    allEvents: "Tous événements",
    matchStatsSoon:
      "Buts, temps de jeu et résultats arriveront avec le module compétitions. Les chiffres ci-dessus viennent des présences pointées.",
    invitations: "invitations",
    presences: "présences",
    errors: {
      STALE_VERSION:
        "La fiche a été modifiée entre-temps. Actualisez puis recommencez.",
    },
  },
  nl: {
    back: "Alle spelers",
    personalTab: "Persoonlijk",
    sportTab: "Sportief",
    loading: "Fiche wordt geladen…",
    unavailable: "Deze fiche is niet toegankelijk met uw actief profiel.",
    edit: "Wijzigen",
    cancel: "Annuleren",
    save: "Opslaan",
    saved: "Opgeslagen.",
    empty: "Niet ingevuld",
    identity: "Persoonlijke gegevens",
    birth: "Geboortedatum",
    age: "Leeftijd",
    years: "jaar",
    email: "E-mail",
    phone: "Telefoon",
    joined: "Lid sinds",
    account: "Aanmeldaccount",
    yes: "Ja",
    no: "Nee",
    noDetails:
      "Persoonlijke gegevens zijn voorbehouden aan de persoon, de vertegenwoordigers en de beheerders van het register.",
    support: "Noden en begeleiding",
    supportHint:
      "Praktische informatie om de speler veilig te begeleiden. Zichtbaar voor de coaches.",
    supportNeeds: "Begeleidingsnoden (transfers, communicatie, routines)",
    safety: "Veiligheid op het veld",
    emergency: "Noodcontact",
    confidential: "Beperking en gezondheid",
    confidentialHint:
      "Vertrouwelijk en versleuteld. Alleen zichtbaar voor de persoon, de wettelijke vertegenwoordigers en medewerkers met een uitdrukkelijke machtiging. Nooit zichtbaar in lijsten.",
    impairment: "Beperking of diagnose",
    medical:
      "Nuttige medische informatie (behandelingen, allergieën, noodprotocol)",
    restricted:
      "Beperkte toegang. Deze vertrouwelijke gegevens zijn niet zichtbaar met uw profiel.",
    guardians: "Verantwoordelijken",
    noGuardians: "Geen vertegenwoordiger geregistreerd.",
    relationKinds: {
      legal_verified: "Geverifieerde wettelijke vertegenwoordiger",
      delegated_aid: "Gedelegeerde hulp",
      declared: "Opgegeven relatie",
    },
    canEdit: "mag wijzigen",
    canView: "mag inkijken",
    history: "Geschiedenis in de club",
    joinedClub: "Aankomst in de club",
    current: "Lopend",
    ended: "Beëindigd",
    roles: {
      player: "Speler",
      coach: "Coach",
      assistant: "Assistent",
      volunteer: "Vrijwilliger",
    },
    formerPlayer: "Oud-speler",
    attendance: "Aanwezigheid",
    attendanceRate: "Aanwezigheidsgraad",
    answerRate: "Antwoorden op uitnodigingen",
    closedSessions: "geregistreerde sessies",
    recent: "Laatste activiteiten",
    noAttendance: "Nog geen uitnodiging.",
    responses: {
      none: "Geen antwoord",
      present: "Aanwezig",
      absent: "Afwezig",
      uncertain: "Onzeker",
    },
    actuals: {
      unchecked: "Niet geregistreerd",
      present: "Aanwezig",
      absent: "Afwezig",
      late: "Te laat",
      early: "Vroeger vertrokken",
    },
    cancelled: "Geannuleerd",
    documents: "Documenten",
    dues: "Bijdragen",
    nextDue: "Volgende vervaldag",
    game: "Spelprofiel",
    position: "Positie",
    jersey: "Nummer",
    team: "Team",
    classification: "Sportclassificatie",
    classificationHint: "Officiële sportklasse (FIPFA). Geen medisch gegeven.",
    classifications: {
      PF1: "PF1",
      PF2: "PF2",
      pending: "Beoordeling lopend",
      not_classified: "Niet geclassificeerd",
    },
    validUntil: "Geldig tot",
    control: "Besturing van de rolstoel",
    controls: {
      "": "Niet ingevuld",
      right_hand: "Rechterhand",
      left_hand: "Linkerhand",
      chin: "Kin",
      head: "Hoofd",
      other: "Andere",
    },
    sportNotes: "Sportnotities (sterktes, rol, instructies)",
    chairs: "Rolstoelen",
    noChair: "Geen rolstoel gekoppeld aan deze speler.",
    primary: "Hoofdrolstoel",
    speed: "Max. snelheid",
    shared: "gedeeld met",
    equipmentLink: "Materiaal bekijken",
    stats: "Statistieken",
    allEvents: "Alle activiteiten",
    matchStatsSoon:
      "Doelpunten, speeltijd en uitslagen volgen met de competitiemodule. De cijfers hierboven komen uit de geregistreerde aanwezigheden.",
    invitations: "uitnodigingen",
    presences: "aanwezigheden",
    errors: {
      STALE_VERSION:
        "De fiche werd intussen gewijzigd. Vernieuw en probeer opnieuw.",
    },
  },
  en: {
    back: "All players",
    personalTab: "Personal view",
    sportTab: "Sport view",
    loading: "Loading the profile…",
    unavailable: "This profile is not available with your active profile.",
    edit: "Edit",
    cancel: "Cancel",
    save: "Save",
    saved: "Saved.",
    empty: "Not provided",
    identity: "Personal information",
    birth: "Date of birth",
    age: "Age",
    years: "years",
    email: "Email",
    phone: "Phone",
    joined: "Member since",
    account: "Sign-in account",
    yes: "Yes",
    no: "No",
    noDetails:
      "Personal information is reserved for the person, their representatives and directory managers.",
    support: "Support needs",
    supportHint:
      "Practical information to supervise the player safely. Visible to their coaches.",
    supportNeeds: "Support needs (transfers, communication, routines)",
    safety: "Safety on the court",
    emergency: "Emergency contact",
    confidential: "Impairment and health",
    confidentialHint:
      "Confidential and encrypted. Visible only to the person, their legal representatives and staff with an explicit permission. Never shown in lists.",
    impairment: "Impairment or diagnosis",
    medical:
      "Useful medical information (treatments, allergies, emergency protocol)",
    restricted:
      "Restricted. This confidential information is not visible with your profile.",
    guardians: "Responsible people",
    noGuardians: "No representative recorded.",
    relationKinds: {
      legal_verified: "Verified legal representative",
      delegated_aid: "Delegated helper",
      declared: "Declared relationship",
    },
    canEdit: "can edit",
    canView: "can view",
    history: "Club history",
    joinedClub: "Joined the club",
    current: "Current",
    ended: "Ended",
    roles: {
      player: "Player",
      coach: "Coach",
      assistant: "Assistant",
      volunteer: "Volunteer",
    },
    formerPlayer: "Former player",
    attendance: "Attendance",
    attendanceRate: "Attendance rate",
    answerRate: "Invitation answers",
    closedSessions: "recorded sessions",
    recent: "Latest events",
    noAttendance: "No invitation yet.",
    responses: {
      none: "No answer",
      present: "Present",
      absent: "Absent",
      uncertain: "Unsure",
    },
    actuals: {
      unchecked: "Not recorded",
      present: "Present",
      absent: "Absent",
      late: "Late",
      early: "Left early",
    },
    cancelled: "Cancelled",
    documents: "Documents",
    dues: "Dues",
    nextDue: "Next instalment",
    game: "Playing profile",
    position: "Position",
    jersey: "Number",
    team: "Team",
    classification: "Sport classification",
    classificationHint:
      "Official sport class (FIPFA). Not medical information.",
    classifications: {
      PF1: "PF1",
      PF2: "PF2",
      pending: "Assessment pending",
      not_classified: "Not classified",
    },
    validUntil: "Valid until",
    control: "Chair control",
    controls: {
      "": "Not provided",
      right_hand: "Right hand",
      left_hand: "Left hand",
      chin: "Chin",
      head: "Head",
      other: "Other",
    },
    sportNotes: "Sport notes (strengths, role, instructions)",
    chairs: "Chairs",
    noChair: "No chair linked to this player.",
    primary: "Main",
    speed: "Max speed",
    shared: "shared with",
    equipmentLink: "See equipment",
    stats: "Statistics",
    allEvents: "All events",
    matchStatsSoon:
      "Goals, playing time and results will come with the competitions module. The figures above come from recorded attendance.",
    invitations: "invitations",
    presences: "attended",
    errors: {
      STALE_VERSION:
        "This profile changed in the meantime. Refresh and try again.",
    },
  },
};

/** Match statistics (competitions module). */
export const matchCopy = {
  fr: {
    title: "Matchs",
    played: "Matchs joués",
    starts: "titulaire",
    minutes: "Minutes",
    goals: "Buts",
    assists: "Passes décisives",
    cards: "Cartons",
    recent: "Derniers matchs",
    none: "Aucun match joué enregistré.",
    vs: "contre",
    at: "chez",
    link: "Voir les matchs",
  },
  nl: {
    title: "Wedstrijden",
    played: "Gespeelde wedstrijden",
    starts: "basisspeler",
    minutes: "Minuten",
    goals: "Doelpunten",
    assists: "Assists",
    cards: "Kaarten",
    recent: "Laatste wedstrijden",
    none: "Nog geen gespeelde wedstrijd geregistreerd.",
    vs: "tegen",
    at: "bij",
    link: "Wedstrijden bekijken",
  },
  en: {
    title: "Matches",
    played: "Matches played",
    starts: "starts",
    minutes: "Minutes",
    goals: "Goals",
    assists: "Assists",
    cards: "Cards",
    recent: "Latest matches",
    none: "No match played yet.",
    vs: "vs",
    at: "at",
    link: "See matches",
  },
};
