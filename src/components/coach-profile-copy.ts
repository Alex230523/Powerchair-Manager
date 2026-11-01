import type { Locale } from "../lib/locale";
type Copy = {
  back: string;
  loading: string;
  unavailable: string;
  coach: string;
  former: string;
  identity: string;
  email: string;
  phone: string;
  birth: string;
  years: string;
  joined: string;
  account: string;
  yes: string;
  no: string;
  noDetails: string;
  teams: string;
  noTeam: string;
  roles: Record<string, string>;
  current: string;
  ended: string;
  upcoming: string;
  noUpcoming: string;
  responses: Record<string, string>;
  noAnswer: string;
  presence: string;
  presenceHint: string;
  training: string;
  matches: string;
  other: string;
  sessions: string;
  formations: string;
  formationsHint: string;
  noFormation: string;
  statuses: Record<string, string>;
  validUntil: string;
  completed: string;
  requestTitle: string;
  course: string;
  chooseCourse: string;
  note: string;
  request: string;
  requested: string;
  cancelRequest: string;
  noCourses: string;
  noFederation: string;
  hours: string;
  errors: Record<string, string>;
};
export const coachProfileCopy: Record<Locale, Copy> = {
  fr: {
    back: "Retour aux coachs",
    loading: "Chargement de la fiche…",
    unavailable: "Fiche indisponible pour le moment.",
    coach: "Coach",
    former: "Ancien coach",
    identity: "Informations",
    email: "E-mail",
    phone: "Téléphone",
    birth: "Date de naissance",
    years: "ans",
    joined: "Arrivée au club",
    account: "Compte lié",
    yes: "Oui",
    no: "Non",
    noDetails: "Coordonnées réservées à la gestion du club.",
    teams: "Équipes encadrées",
    noTeam: "Aucune équipe attribuée.",
    roles: { coach: "Coach", assistant: "Assistant" },
    current: "En cours",
    ended: "Terminé",
    upcoming: "Prochains matchs et entraînements",
    noUpcoming: "Rien de prévu pour ses équipes.",
    responses: {
      present: "Présent",
      absent: "Absent",
      uncertain: "Incertain",
      none: "Pas encore répondu",
    },
    noAnswer: "Pas d'invitation",
    presence: "Présences",
    presenceHint: "Séances passées dont le registre est clôturé.",
    training: "Entraînements",
    matches: "Matchs",
    other: "Autres",
    sessions: "séances",
    formations: "Formations",
    formationsHint:
      "Les formations sont créées par la fédération. Le coach ou le président demande la validation, avec un justificatif ; la fédération confirme.",
    noFormation: "Aucune formation enregistrée.",
    statuses: {
      requested: "En attente de la fédération",
      approved: "Validée",
      refused: "Refusée",
      cancelled: "Annulée",
    },
    validUntil: "Valable jusqu'au",
    completed: "Obtenue le",
    requestTitle: "Demander la validation d'une formation",
    course: "Formation",
    chooseCourse: "Choisir une formation",
    note: "Message pour la fédération (facultatif)",
    request: "Envoyer la demande",
    requested: "Demande envoyée à la fédération.",
    cancelRequest: "Annuler la demande",
    noCourses: "La fédération n'a encore publié aucune formation.",
    noFederation:
      "Le club n'est affilié à aucune fédération : choisissez la BPCF dans Gestion du club pour voir ses formations.",
    hours: "h",
    errors: {
      DUPLICATE: "Une demande est déjà en attente pour cette formation.",
      NOT_FOUND: "Coach introuvable.",
    },
  },
  nl: {
    back: "Terug naar coaches",
    loading: "Fiche laden…",
    unavailable: "Fiche momenteel niet beschikbaar.",
    coach: "Coach",
    former: "Voormalige coach",
    identity: "Gegevens",
    email: "E-mail",
    phone: "Telefoon",
    birth: "Geboortedatum",
    years: "jaar",
    joined: "Bij de club sinds",
    account: "Gekoppeld account",
    yes: "Ja",
    no: "Nee",
    noDetails: "Contactgegevens enkel voor het clubbeheer.",
    teams: "Begeleide teams",
    noTeam: "Geen team toegewezen.",
    roles: { coach: "Coach", assistant: "Assistent" },
    current: "Lopend",
    ended: "Beëindigd",
    upcoming: "Volgende wedstrijden en trainingen",
    noUpcoming: "Niets gepland voor zijn teams.",
    responses: {
      present: "Aanwezig",
      absent: "Afwezig",
      uncertain: "Onzeker",
      none: "Nog niet geantwoord",
    },
    noAnswer: "Geen uitnodiging",
    presence: "Aanwezigheden",
    presenceHint: "Voorbije sessies met afgesloten register.",
    training: "Trainingen",
    matches: "Wedstrijden",
    other: "Andere",
    sessions: "sessies",
    formations: "Opleidingen",
    formationsHint:
      "Opleidingen worden door de federatie aangemaakt. De coach of de voorzitter vraagt de validatie aan, met een bewijsstuk; de federatie bevestigt.",
    noFormation: "Geen opleiding geregistreerd.",
    statuses: {
      requested: "Wacht op de federatie",
      approved: "Gevalideerd",
      refused: "Geweigerd",
      cancelled: "Geannuleerd",
    },
    validUntil: "Geldig tot",
    completed: "Behaald op",
    requestTitle: "Validatie van een opleiding aanvragen",
    course: "Opleiding",
    chooseCourse: "Kies een opleiding",
    note: "Bericht voor de federatie (optioneel)",
    request: "Aanvraag versturen",
    requested: "Aanvraag naar de federatie verstuurd.",
    cancelRequest: "Aanvraag annuleren",
    noCourses: "De federatie heeft nog geen opleidingen gepubliceerd.",
    noFederation:
      "De club is bij geen federatie aangesloten: kies de BPCF in Clubbeheer om haar opleidingen te zien.",
    hours: "u",
    errors: {
      DUPLICATE: "Er loopt al een aanvraag voor deze opleiding.",
      NOT_FOUND: "Coach niet gevonden.",
    },
  },
  en: {
    back: "Back to coaches",
    loading: "Loading profile…",
    unavailable: "Profile unavailable right now.",
    coach: "Coach",
    former: "Former coach",
    identity: "Details",
    email: "Email",
    phone: "Phone",
    birth: "Date of birth",
    years: "years",
    joined: "Joined the club",
    account: "Linked account",
    yes: "Yes",
    no: "No",
    noDetails: "Contact details are reserved for club management.",
    teams: "Teams coached",
    noTeam: "No team assigned.",
    roles: { coach: "Coach", assistant: "Assistant" },
    current: "Current",
    ended: "Ended",
    upcoming: "Upcoming matches and training",
    noUpcoming: "Nothing scheduled for their teams.",
    responses: {
      present: "Present",
      absent: "Absent",
      uncertain: "Unsure",
      none: "No answer yet",
    },
    noAnswer: "Not invited",
    presence: "Attendance",
    presenceHint: "Past sessions whose register is closed.",
    training: "Training",
    matches: "Matches",
    other: "Other",
    sessions: "sessions",
    formations: "Courses",
    formationsHint:
      "Courses are created by the federation. The coach or the president asks for validation, with a proof; the federation confirms.",
    noFormation: "No course recorded.",
    statuses: {
      requested: "Awaiting the federation",
      approved: "Approved",
      refused: "Refused",
      cancelled: "Cancelled",
    },
    validUntil: "Valid until",
    completed: "Completed on",
    requestTitle: "Ask for a course to be validated",
    course: "Course",
    chooseCourse: "Choose a course",
    note: "Message for the federation (optional)",
    request: "Send request",
    requested: "Request sent to the federation.",
    cancelRequest: "Cancel request",
    noCourses: "The federation has not published any course yet.",
    noFederation:
      "The club is not affiliated with a federation: choose the BPCF in Club management to see its courses.",
    hours: "h",
    errors: {
      DUPLICATE: "A request for this course is already pending.",
      NOT_FOUND: "Coach not found.",
    },
  },
};
