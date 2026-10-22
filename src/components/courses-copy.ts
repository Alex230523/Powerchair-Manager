import type { Locale } from "../lib/locale";
type Copy = {
  title: string;
  intro: string;
  loading: string;
  unavailable: string;
  federationOnly: string;
  readOnly: string;
  catalogue: string;
  newCourse: string;
  courseTitle: string;
  level: string;
  hours: string;
  validity: string;
  validityHint: string;
  description: string;
  create: string;
  created: string;
  save: string;
  saved: string;
  edit: string;
  cancel: string;
  active: string;
  inactive: string;
  deactivate: string;
  activate: string;
  approvedCount: string;
  pendingCount: string;
  noCourse: string;
  requests: string;
  requestsHint: string;
  noRequest: string;
  club: string;
  coach: string;
  course: string;
  requestedBy: string;
  proof: string;
  statuses: Record<string, string>;
  completedOn: string;
  decisionNote: string;
  approve: string;
  refuse: string;
  decided: string;
  validUntil: string;
  years: string;
  errors: Record<string, string>;
};
export const coursesCopy: Record<Locale, Copy> = {
  fr: {
    title: "Formations des coachs",
    intro:
      "Créez les formations reconnues par la fédération. Les présidents de club demandent leur ajout pour un coach, vous confirmez ou refusez.",
    loading: "Chargement des formations…",
    unavailable: "Formations indisponibles pour le moment.",
    federationOnly:
      "Choisissez un profil fédéral pour gérer les formations des coachs.",
    readOnly: "Lecture seule : seul le président fédéral modifie le catalogue.",
    catalogue: "Catalogue",
    newCourse: "Nouvelle formation",
    courseTitle: "Intitulé",
    level: "Niveau",
    hours: "Durée (heures)",
    validity: "Validité (années)",
    validityHint: "Vide si la formation n'expire pas.",
    description: "Description",
    create: "Créer la formation",
    created: "Formation créée.",
    save: "Enregistrer",
    saved: "Formation mise à jour.",
    edit: "Modifier",
    cancel: "Annuler",
    active: "Active",
    inactive: "Archivée",
    deactivate: "Archiver",
    activate: "Réactiver",
    approvedCount: "validées",
    pendingCount: "en attente",
    noCourse: "Aucune formation pour l'instant.",
    requests: "Demandes des clubs",
    requestsHint: "Les demandes en attente apparaissent en premier.",
    noRequest: "Aucune demande.",
    club: "Club",
    coach: "Coach",
    course: "Formation",
    requestedBy: "Demandé par",
    proof: "Justificatif : {name}",
    statuses: {
      requested: "En attente",
      approved: "Validée",
      refused: "Refusée",
    },
    completedOn: "Date d'obtention",
    decisionNote: "Commentaire (facultatif)",
    approve: "Valider",
    refuse: "Refuser",
    decided: "Décision enregistrée.",
    validUntil: "valable jusqu'au",
    years: "ans",
    errors: {
      DUPLICATE: "Une formation porte déjà cet intitulé.",
      FEDERATION_ONLY:
        "Choisissez un profil fédéral pour gérer les formations des coachs.",
    },
  },
  nl: {
    title: "Coachopleidingen",
    intro:
      "Maak de door de federatie erkende opleidingen aan. Clubvoorzitters vragen de toevoeging voor een coach aan, u bevestigt of weigert.",
    loading: "Opleidingen laden…",
    unavailable: "Opleidingen momenteel niet beschikbaar.",
    federationOnly: "Kies een federatieprofiel om coachopleidingen te beheren.",
    readOnly:
      "Alleen lezen: enkel de federatievoorzitter wijzigt de catalogus.",
    catalogue: "Catalogus",
    newCourse: "Nieuwe opleiding",
    courseTitle: "Titel",
    level: "Niveau",
    hours: "Duur (uren)",
    validity: "Geldigheid (jaren)",
    validityHint: "Leeg als de opleiding niet vervalt.",
    description: "Beschrijving",
    create: "Opleiding aanmaken",
    created: "Opleiding aangemaakt.",
    save: "Opslaan",
    saved: "Opleiding bijgewerkt.",
    edit: "Wijzigen",
    cancel: "Annuleren",
    active: "Actief",
    inactive: "Gearchiveerd",
    deactivate: "Archiveren",
    activate: "Heractiveren",
    approvedCount: "gevalideerd",
    pendingCount: "in behandeling",
    noCourse: "Nog geen opleidingen.",
    requests: "Aanvragen van clubs",
    requestsHint: "Openstaande aanvragen staan bovenaan.",
    noRequest: "Geen aanvragen.",
    club: "Club",
    coach: "Coach",
    course: "Opleiding",
    requestedBy: "Aangevraagd door",
    proof: "Bewijsstuk: {name}",
    statuses: {
      requested: "In behandeling",
      approved: "Gevalideerd",
      refused: "Geweigerd",
    },
    completedOn: "Datum behaald",
    decisionNote: "Opmerking (optioneel)",
    approve: "Valideren",
    refuse: "Weigeren",
    decided: "Beslissing opgeslagen.",
    validUntil: "geldig tot",
    years: "jaar",
    errors: {
      DUPLICATE: "Er bestaat al een opleiding met deze titel.",
      FEDERATION_ONLY:
        "Kies een federatieprofiel om coachopleidingen te beheren.",
    },
  },
  en: {
    title: "Coach education",
    intro:
      "Create the courses recognised by the federation. Club presidents ask for one to be added for a coach; you confirm or refuse.",
    loading: "Loading courses…",
    unavailable: "Courses unavailable right now.",
    federationOnly: "Choose a federation profile to manage coach education.",
    readOnly: "Read only: only the federation president edits the catalogue.",
    catalogue: "Catalogue",
    newCourse: "New course",
    courseTitle: "Title",
    level: "Level",
    hours: "Length (hours)",
    validity: "Validity (years)",
    validityHint: "Leave empty when the course does not expire.",
    description: "Description",
    create: "Create course",
    created: "Course created.",
    save: "Save",
    saved: "Course updated.",
    edit: "Edit",
    cancel: "Cancel",
    active: "Active",
    inactive: "Archived",
    deactivate: "Archive",
    activate: "Reactivate",
    approvedCount: "approved",
    pendingCount: "pending",
    noCourse: "No course yet.",
    requests: "Club requests",
    requestsHint: "Pending requests are listed first.",
    noRequest: "No request.",
    club: "Club",
    coach: "Coach",
    course: "Course",
    requestedBy: "Requested by",
    proof: "Proof: {name}",
    statuses: {
      requested: "Pending",
      approved: "Approved",
      refused: "Refused",
    },
    completedOn: "Completion date",
    decisionNote: "Comment (optional)",
    approve: "Approve",
    refuse: "Refuse",
    decided: "Decision saved.",
    validUntil: "valid until",
    years: "years",
    errors: {
      DUPLICATE: "A course with this title already exists.",
      FEDERATION_ONLY: "Choose a federation profile to manage coach education.",
    },
  },
};
