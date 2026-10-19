import type { Locale } from "../lib/locale";
import type { delegable } from "@/domains/access/policy";

type Grant = (typeof delegable)[number];
type Copy = {
  title: string;
  intro: string;
  loading: string;
  unavailable: string;
  presidentOnly: string;
  selfTitle: string;
  selfIntro: string;
  selfDone: string;
  selfTeams: string;
  selfTeam: string;
  noTeamChoice: string;
  selfAdd: string;
  selfAdded: string;
  selfProfile: string;
  accessTitle: string;
  accessIntro: string;
  noMember: string;
  teamScope: string;
  allTeams: string;
  saveScope: string;
  scopeSaved: string;
  presets: string;
  presetField: string;
  presetHead: string;
  presetTreasurer: string;
  presetNone: string;
  saveGrants: string;
  grantsSaved: string;
  groups: Record<string, string>;
  grants: Record<Grant, string>;
  roles: Record<string, string>;
};

const fr: Copy = {
  title: "Réglages",
  intro:
    "Le président choisit ici ce que chaque coach ou membre peut faire dans l'application.",
  loading: "Chargement des réglages…",
  unavailable: "Réglages indisponibles pour le moment.",
  presidentOnly:
    "Ces réglages sont réservés au président du club (avec la double authentification).",
  selfTitle: "Je suis aussi coach",
  selfIntro:
    "Un président peut aussi entraîner. Votre fiche existante reçoit le rôle de coach : pas de doublon dans les listes ni dans les statistiques.",
  selfDone: "Vous figurez dans la liste des coachs.",
  selfTeams: "Équipes encadrées",
  selfTeam: "Équipe à encadrer (facultatif)",
  noTeamChoice: "Aucune pour l'instant",
  selfAdd: "M'ajouter comme coach",
  selfAdded: "Vous êtes maintenant aussi coach du club.",
  selfProfile: "Voir ma fiche coach",
  accessTitle: "Rôles et accès des coachs",
  accessIntro:
    "Cochez ce que chaque personne peut consulter ou gérer. Vous ne pouvez déléguer que des droits que vous possédez.",
  noMember:
    "Aucun coach ou membre à configurer. Invitez-les depuis Mon espace.",
  teamScope: "Équipe suivie",
  allTeams: "Toutes ses équipes",
  saveScope: "Enregistrer l'équipe",
  scopeSaved: "Équipe suivie mise à jour.",
  presets: "Préréglages",
  presetField: "Coach terrain",
  presetHead: "Coach principal",
  presetTreasurer: "Trésorier",
  presetNone: "Aucun accès",
  saveGrants: "Enregistrer les accès",
  grantsSaved: "Accès mis à jour.",
  groups: {
    people: "Joueurs et personnes",
    teams: "Équipes et présences",
    club: "Vie du club",
    money: "Finances et matériel",
    admin: "Administration",
  },
  grants: {
    "members.read": "Voir les membres",
    "invitations.create": "Inviter des membres",
    "audit.read": "Consulter le journal",
    "people.read": "Consulter les joueurs",
    "people.manage": "Gérer les joueurs et familles",
    "people.export": "Exporter les joueurs",
    "people.sensitive": "Voir les données médicales",
    "teams.manage": "Gérer équipes et saisons",
    "attendance.manage": "Gérer les présences",
    "calendar.read": "Voir tout le calendrier",
    "calendar.manage": "Gérer le calendrier",
    "registrations.manage": "Gérer les inscriptions",
    "documents.read": "Consulter les documents",
    "documents.manage": "Gérer les documents",
    "documents.sensitive": "Documents sensibles",
    "notifications.manage": "Gérer les notifications",
    "dues.manage": "Gérer cotisations et finances",
    "equipment.manage": "Gérer le matériel",
  },
  roles: {
    coach: "Coach",
    player: "Joueur",
    guardian: "Parent / représentant",
  },
};
const nl: Copy = {
  title: "Instellingen",
  intro:
    "De voorzitter kiest hier wat elke coach of elk lid in de applicatie mag doen.",
  loading: "Instellingen laden…",
  unavailable: "Instellingen momenteel niet beschikbaar.",
  presidentOnly:
    "Deze instellingen zijn voorbehouden aan de clubvoorzitter (met tweestapsverificatie).",
  selfTitle: "Ik ben ook coach",
  selfIntro:
    "Een voorzitter kan ook trainen. Uw bestaande fiche krijgt de rol van coach: geen dubbels in lijsten of statistieken.",
  selfDone: "U staat in de lijst van coaches.",
  selfTeams: "Begeleide teams",
  selfTeam: "Te begeleiden team (optioneel)",
  noTeamChoice: "Nog geen",
  selfAdd: "Mij toevoegen als coach",
  selfAdded: "U bent nu ook coach van de club.",
  selfProfile: "Mijn coachfiche bekijken",
  accessTitle: "Rollen en toegang van coaches",
  accessIntro:
    "Vink aan wat elke persoon mag raadplegen of beheren. U kunt enkel rechten delegeren die u zelf hebt.",
  noMember:
    "Geen coach of lid om in te stellen. Nodig hen uit via Mijn ruimte.",
  teamScope: "Gevolgd team",
  allTeams: "Al zijn teams",
  saveScope: "Team opslaan",
  scopeSaved: "Gevolgd team bijgewerkt.",
  presets: "Voorinstellingen",
  presetField: "Veldcoach",
  presetHead: "Hoofdcoach",
  presetTreasurer: "Penningmeester",
  presetNone: "Geen toegang",
  saveGrants: "Toegang opslaan",
  grantsSaved: "Toegang bijgewerkt.",
  groups: {
    people: "Spelers en personen",
    teams: "Teams en aanwezigheden",
    club: "Clubleven",
    money: "Financiën en materiaal",
    admin: "Beheer",
  },
  grants: {
    "members.read": "Leden bekijken",
    "invitations.create": "Leden uitnodigen",
    "audit.read": "Logboek raadplegen",
    "people.read": "Spelers raadplegen",
    "people.manage": "Spelers en families beheren",
    "people.export": "Spelers exporteren",
    "people.sensitive": "Medische gegevens zien",
    "teams.manage": "Teams en seizoenen beheren",
    "attendance.manage": "Aanwezigheden beheren",
    "calendar.read": "Volledige kalender zien",
    "calendar.manage": "Kalender beheren",
    "registrations.manage": "Inschrijvingen beheren",
    "documents.read": "Documenten raadplegen",
    "documents.manage": "Documenten beheren",
    "documents.sensitive": "Gevoelige documenten",
    "notifications.manage": "Meldingen beheren",
    "dues.manage": "Bijdragen en financiën beheren",
    "equipment.manage": "Materiaal beheren",
  },
  roles: {
    coach: "Coach",
    player: "Speler",
    guardian: "Ouder / vertegenwoordiger",
  },
};
const en: Copy = {
  title: "Settings",
  intro:
    "The president decides here what each coach or member can do in the app.",
  loading: "Loading settings…",
  unavailable: "Settings unavailable right now.",
  presidentOnly:
    "These settings are reserved for the club president (with two-factor authentication).",
  selfTitle: "I also coach",
  selfIntro:
    "A president can also coach. Your existing profile gets the coach role: no duplicate in lists or statistics.",
  selfDone: "You are listed as a coach.",
  selfTeams: "Teams coached",
  selfTeam: "Team to coach (optional)",
  noTeamChoice: "None for now",
  selfAdd: "Add me as a coach",
  selfAdded: "You are now also a coach of the club.",
  selfProfile: "Open my coach profile",
  accessTitle: "Coach roles and access",
  accessIntro:
    "Tick what each person may view or manage. You can only delegate rights you hold yourself.",
  noMember: "No coach or member to configure. Invite them from My space.",
  teamScope: "Team followed",
  allTeams: "All their teams",
  saveScope: "Save team",
  scopeSaved: "Team followed updated.",
  presets: "Presets",
  presetField: "Pitch coach",
  presetHead: "Head coach",
  presetTreasurer: "Treasurer",
  presetNone: "No access",
  saveGrants: "Save access",
  grantsSaved: "Access updated.",
  groups: {
    people: "Players and people",
    teams: "Teams and attendance",
    club: "Club life",
    money: "Finance and equipment",
    admin: "Administration",
  },
  grants: {
    "members.read": "See members",
    "invitations.create": "Invite members",
    "audit.read": "Read the audit log",
    "people.read": "View players",
    "people.manage": "Manage players and families",
    "people.export": "Export players",
    "people.sensitive": "See medical data",
    "teams.manage": "Manage teams and seasons",
    "attendance.manage": "Manage attendance",
    "calendar.read": "See the whole calendar",
    "calendar.manage": "Manage the calendar",
    "registrations.manage": "Manage registrations",
    "documents.read": "View documents",
    "documents.manage": "Manage documents",
    "documents.sensitive": "Sensitive documents",
    "notifications.manage": "Manage notifications",
    "dues.manage": "Manage dues and finance",
    "equipment.manage": "Manage equipment",
  },
  roles: {
    coach: "Coach",
    player: "Player",
    guardian: "Parent / representative",
  },
};
export const settingsCopy: Record<Locale, Copy> = { fr, nl, en };

/** Grants shown together on the settings page. */
export const grantGroups: { key: string; grants: Grant[] }[] = [
  {
    key: "people",
    grants: [
      "people.read",
      "people.manage",
      "people.export",
      "people.sensitive",
    ],
  },
  {
    key: "teams",
    grants: [
      "teams.manage",
      "attendance.manage",
      "calendar.read",
      "calendar.manage",
    ],
  },
  {
    key: "club",
    grants: [
      "registrations.manage",
      "documents.read",
      "documents.manage",
      "documents.sensitive",
      "notifications.manage",
    ],
  },
  { key: "money", grants: ["dues.manage", "equipment.manage"] },
  {
    key: "admin",
    grants: ["members.read", "invitations.create", "audit.read"],
  },
];
/** Typical coach profiles, applied in one click then adjustable. */
export const presets: Record<"field" | "head" | "treasurer" | "none", Grant[]> =
  {
    treasurer: ["dues.manage", "people.read", "documents.read", "members.read"],
    field: [
      "people.read",
      "calendar.read",
      "attendance.manage",
      "documents.read",
    ],
    head: [
      "people.read",
      "teams.manage",
      "calendar.read",
      "calendar.manage",
      "attendance.manage",
      "documents.read",
      "equipment.manage",
    ],
    none: [],
  };
